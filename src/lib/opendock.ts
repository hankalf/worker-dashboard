import { prisma, getActiveLocationId } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Opendock integration (per-location). Config lives in LocationSetting under
// opendock.* keys. A small server-side client logs into Opendock's REST API
// ("Neutron", JWT via /auth/login), pulls the warehouse's appointments, and
// maps each appointment to an employee via the appointment TAG that carries the
// employee's name. The result is shown as a status pill on the dashboard badge.
//
// NOTE: the exact endpoint paths + appointment field names below are based on
// Opendock's documented shape and will be finalized against a real sample
// response. Everything is wrapped so a bad/missing config never breaks the
// board — it just shows no dock pills.
// ---------------------------------------------------------------------------

const KEY = {
  enabled: "opendock.enabled",
  baseUrl: "opendock.baseUrl",
  email: "opendock.email",
  password: "opendock.password",
  warehouseId: "opendock.warehouseId",
} as const;

export type OpendockConfig = {
  enabled: boolean;
  baseUrl: string;
  email: string;
  warehouseId: string;
};

// The full config including the secret — server-only, never sent to the client.
type OpendockConfigFull = OpendockConfig & { password: string };

async function readAll(): Promise<Record<string, string>> {
  const locationId = await getActiveLocationId();
  if (!locationId) return {};
  const rows = await prisma.locationSetting.findMany({
    where: { locationId, key: { in: Object.values(KEY) } },
  });
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

async function fullConfig(): Promise<OpendockConfigFull> {
  const m = await readAll();
  return {
    enabled: m[KEY.enabled] === "true",
    baseUrl: (m[KEY.baseUrl] ?? "").replace(/\/+$/, ""),
    email: m[KEY.email] ?? "",
    warehouseId: m[KEY.warehouseId] ?? "",
    password: m[KEY.password] ?? "",
  };
}

// Public config for the admin UI — omits the password, adds hasPassword.
export async function getOpendockConfig(): Promise<
  OpendockConfig & { hasPassword: boolean }
> {
  const c = await fullConfig();
  return {
    enabled: c.enabled,
    baseUrl: c.baseUrl,
    email: c.email,
    warehouseId: c.warehouseId,
    hasPassword: !!c.password,
  };
}

// Save config (partial). A blank password leaves the stored one untouched, so
// editing other fields doesn't wipe the secret.
export async function setOpendockConfig(input: {
  enabled?: boolean;
  baseUrl?: string;
  email?: string;
  warehouseId?: string;
  password?: string;
}): Promise<void> {
  const locationId = await getActiveLocationId();
  if (!locationId) return;
  const set = async (key: string, value: string) => {
    await prisma.locationSetting.upsert({
      where: { locationId_key: { locationId, key } },
      update: { value },
      create: { locationId, key, value },
    });
  };
  if (input.enabled !== undefined) await set(KEY.enabled, input.enabled ? "true" : "false");
  if (input.baseUrl !== undefined) await set(KEY.baseUrl, input.baseUrl.trim());
  if (input.email !== undefined) await set(KEY.email, input.email.trim());
  if (input.warehouseId !== undefined) await set(KEY.warehouseId, input.warehouseId.trim());
  if (input.password) await set(KEY.password, input.password);
}

// ---- Status model shown on the badge --------------------------------------

// Colour tone for the pill; mapped from Opendock's raw status.
export type DockTone = "scheduled" | "arrived" | "active" | "done" | "other";

export type DockStatus = {
  label: string; // display label, e.g. "Arrived"
  dock: string | null; // dock door name/number if known
  tone: DockTone;
};

// Map a raw Opendock status to a friendly label + tone. Opendock's Neutron API
// uses: Requested, Scheduled, Arrived, Completed, Cancelled, NoShow (some
// warehouses also have an in-progress/loading state). Matched loosely so minor
// spelling/casing differences still land on the right tone.
function mapStatus(raw: string): { label: string; tone: DockTone } {
  const s = raw.toLowerCase().replace(/[\s_-]/g, "");
  if (s.includes("cancel") || s.includes("noshow")) return { label: raw, tone: "other" };
  if (s.includes("complete") || s.includes("departed") || s.includes("done"))
    return { label: "Completed", tone: "done" };
  if (s.includes("progress") || s.includes("loading") || s.includes("unloading"))
    return { label: "In progress", tone: "active" };
  if (s.includes("arriv") || s.includes("checkedin"))
    return { label: "Arrived", tone: "arrived" };
  if (s.includes("requested")) return { label: "Requested", tone: "scheduled" };
  if (s.includes("schedul") || s.includes("booked") || s.includes("pending"))
    return { label: "Scheduled", tone: "scheduled" };
  return { label: raw, tone: "other" };
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

// ---- Opendock API client --------------------------------------------------
// Minimal shapes we read off an appointment. Kept loose so small field-name
// differences don't crash parsing.
type RawAppt = {
  status?: string;
  dockId?: string;
  dockName?: string;
  dock?: { name?: string } | null;
  tags?: unknown; // string[] | { name?: string; value?: string }[]
  [k: string]: unknown;
};

// Pull the employee name(s) off an appointment's tags. Handles tags as plain
// strings or as objects with a name/value — returns every candidate string.
function tagStrings(appt: RawAppt): string[] {
  const t = appt.tags;
  if (!Array.isArray(t)) return [];
  return t
    .map((x) =>
      typeof x === "string"
        ? x
        : x && typeof x === "object"
          ? String((x as { name?: string; value?: string }).name ??
              (x as { value?: string }).value ??
              "")
          : ""
    )
    .filter(Boolean);
}

function dockNameOf(appt: RawAppt): string | null {
  return appt.dockName ?? appt.dock?.name ?? (appt.dockId ? String(appt.dockId) : null);
}

// Pull the bearer token out of the Opendock login response. Opendock's Neutron
// API returns it as `access_token`; the fallbacks cover other shapes.
function tokenFrom(body: unknown): string | null {
  const b = (body ?? {}) as Record<string, unknown>;
  const data = (b.data ?? {}) as Record<string, unknown>;
  return (
    (b.access_token as string) ??
    (b.token as string) ??
    (b.jwt as string) ??
    (data.access_token as string) ??
    (data.token as string) ??
    null
  );
}

// The appointments endpoint. Opendock's Neutron API is nestjs-crud, so we
// filter with the `s` (search) JSON param and join the dock so each appointment
// carries its door name. `limit` returns the paginated { data, total } shape.
function appointmentsUrl(cfg: OpendockConfigFull): string {
  const search = JSON.stringify({ warehouseId: cfg.warehouseId });
  const params = new URLSearchParams({ s: search, limit: "100" });
  params.append("join", "dock");
  return `${cfg.baseUrl}/appointment?${params.toString()}`;
}

// Pull an array of appointments out of a nestjs-crud response, which is either a
// bare array or a { data: [...] } page.
function apptsFrom(body: unknown): RawAppt[] {
  if (Array.isArray(body)) return body as RawAppt[];
  const b = (body ?? {}) as Record<string, unknown>;
  if (Array.isArray(b.data)) return b.data as RawAppt[];
  if (Array.isArray(b.appointments)) return b.appointments as RawAppt[];
  return [];
}

// Log in and return a bearer token, or null.
async function login(cfg: OpendockConfigFull): Promise<string | null> {
  const res = await fetch(`${cfg.baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: cfg.email, password: cfg.password }),
  });
  if (!res.ok) return null;
  const body = await res.json().catch(() => ({}));
  return tokenFrom(body);
}

// Fetch the warehouse's appointments.
async function fetchAppointments(
  cfg: OpendockConfigFull,
  token: string
): Promise<RawAppt[]> {
  const res = await fetch(appointmentsUrl(cfg), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const body = await res.json().catch(() => null);
  return apptsFrom(body);
}

// ---- Cache: don't hit Opendock on every 15s board refresh ------------------
type CacheEntry = { at: number; byName: Record<string, DockStatus> };
const cache = new Map<string, CacheEntry>();
const TTL_MS = 45_000;

// A name→status map for the active location's employees. Keyed by the tag text
// (normalised), so a badge match is a simple lookup by employee name. Returns
// {} when Opendock is off/misconfigured/unreachable — the board is never
// blocked by it.
export async function getEmployeeDockStatuses(): Promise<Record<string, DockStatus>> {
  const locationId = (await getActiveLocationId()) ?? "default";
  const hit = cache.get(locationId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.byName;

  const byName: Record<string, DockStatus> = {};
  try {
    const cfg = await fullConfig();
    if (!cfg.enabled || !cfg.baseUrl || !cfg.email || !cfg.password) {
      cache.set(locationId, { at: Date.now(), byName });
      return byName;
    }
    const token = await login(cfg);
    if (!token) throw new Error("Opendock login failed");
    const appts = await fetchAppointments(cfg, token);
    for (const appt of appts) {
      if (!appt.status) continue;
      const { label, tone } = mapStatus(String(appt.status));
      const dock = dockNameOf(appt);
      for (const tag of tagStrings(appt)) {
        // Last write wins → the most recent matching appointment shows.
        byName[norm(tag)] = { label, dock, tone };
      }
    }
  } catch (e) {
    console.error("[opendock] status sync failed:", (e as Error).message);
  }
  cache.set(locationId, { at: Date.now(), byName });
  return byName;
}

// Force the next getEmployeeDockStatuses() to re-fetch (used after saving config
// or a manual test).
export function clearOpendockCache(): void {
  cache.clear();
}

// ---- Admin "Test connection" diagnostic ------------------------------------
// Opendock's exact API shape can't be verified from the build environment
// (outbound access to it is blocked there), so rather than guessing a single
// endpoint we probe a handful of candidates with the real token and report what
// each one returns. One click tells us which path works and what an appointment
// actually looks like.

export type ProbeResult = {
  label: string;
  url: string;
  status: number | string;
  ok: boolean;
  count: number | null; // rows parsed, when the body was a list
  body: string; // truncated + token-redacted
};

export type OpendockDiagnostic = {
  loginUrl: string;
  loginStatus: number | string;
  loginBody: string;
  tokenFound: boolean;
  tokenClaims: Record<string, unknown> | null;
  probes: ProbeResult[];
  bestUrl: string | null;
  count: number | null;
  sample: unknown | null;
};

const trunc = (s: string, n = 1800) =>
  s.length > n ? s.slice(0, n) + "...(truncated)" : s;

// Never echo a bearer token back into the UI — these get copied into chat.
const redact = (s: string) =>
  s.replace(
    /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+/g,
    "[token redacted]"
  );

const clean = (s: string) => trunc(redact(s));

// Decode the JWT payload (no verification — just to surface role/org, which is
// the usual reason a valid login still can't read appointments).
function decodeClaims(token: string): Record<string, unknown> | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = Buffer.from(
      part.replace(/-/g, "+").replace(/_/g, "/"),
      "base64"
    ).toString("utf8");
    const c = JSON.parse(json) as Record<string, unknown>;
    return {
      email: c.email,
      role: c.role,
      orgId: c.orgId,
      companyId: c.companyId,
      expiresAt:
        typeof c.exp === "number"
          ? new Date(c.exp * 1000).toISOString()
          : undefined,
    };
  } catch {
    return null;
  }
}

async function runProbe(
  label: string,
  url: string,
  token: string
): Promise<{ result: ProbeResult; items: RawAppt[] }> {
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    let items: RawAppt[] = [];
    try {
      items = apptsFrom(JSON.parse(text));
    } catch {
      /* non-JSON body is reported as-is */
    }
    return {
      result: {
        label,
        url,
        status: res.status,
        ok: res.ok,
        count: items.length || null,
        body: clean(text),
      },
      items,
    };
  } catch (e) {
    return {
      result: {
        label,
        url,
        status: "error",
        ok: false,
        count: null,
        body: `request failed: ${(e as Error).message}`,
      },
      items: [],
    };
  }
}

// Candidate endpoints, most-likely first. `s` / `join` / `limit` are the
// nestjs-crud conventions Opendock's Neutron API uses.
function probeTargets(cfg: OpendockConfigFull): { label: string; url: string }[] {
  const b = cfg.baseUrl;
  const w = cfg.warehouseId;
  const scoped: { label: string; url: string }[] = w
    ? [
        {
          label: "appointment (crud filter + dock join)",
          url:
            `${b}/appointment?` +
            new URLSearchParams({
              s: JSON.stringify({ warehouseId: w }),
              limit: "5",
            }).toString() +
            "&join=dock",
        },
        {
          label: "appointment (plain warehouseId param)",
          url: `${b}/appointment?warehouseId=${encodeURIComponent(w)}&limit=5`,
        },
        {
          label: "warehouse (does the ID resolve?)",
          url: `${b}/warehouse/${encodeURIComponent(w)}`,
        },
      ]
    : [];
  return [
    ...scoped,
    { label: "appointment (no filter)", url: `${b}/appointment?limit=5` },
    { label: "appointments (plural)", url: `${b}/appointments?limit=5` },
    { label: "dock (list doors)", url: `${b}/dock?limit=5` },
    { label: "warehouse (list mine)", url: `${b}/warehouse?limit=5` },
    { label: "who am I", url: `${b}/user/me` },
  ];
}

export async function diagnoseOpendock(): Promise<OpendockDiagnostic> {
  const cfg = await fullConfig();
  if (!cfg.baseUrl || !cfg.email || !cfg.password) {
    throw new Error("Fill in the base URL, email and password first.");
  }

  const out: OpendockDiagnostic = {
    loginUrl: `${cfg.baseUrl}/auth/login`,
    loginStatus: "-",
    loginBody: "",
    tokenFound: false,
    tokenClaims: null,
    probes: [],
    bestUrl: null,
    count: null,
    sample: null,
  };

  let token: string | null = null;
  try {
    const res = await fetch(out.loginUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: cfg.email, password: cfg.password }),
      signal: AbortSignal.timeout(15_000),
    });
    out.loginStatus = res.status;
    const text = await res.text();
    out.loginBody = clean(text);
    try {
      token = tokenFrom(JSON.parse(text));
    } catch {
      /* non-JSON body captured above */
    }
    out.tokenFound = !!token;
    if (token) out.tokenClaims = decodeClaims(token);
  } catch (e) {
    out.loginBody = `request failed: ${(e as Error).message}`;
  }

  if (!token) return out;

  const results = await Promise.all(
    probeTargets(cfg).map((t) => runProbe(t.label, t.url, token))
  );
  out.probes = results.map((r) => r.result);

  // The winner: the first probe that came back OK with at least one row.
  const win = results.find((r) => r.result.ok && r.items.length > 0);
  if (win) {
    out.bestUrl = win.result.url;
    out.count = win.items.length;
    out.sample = win.items[0];
  }

  return out;
}

// The normaliser, exported so the board can look up a status by employee name.
export const normalizeName = norm;
