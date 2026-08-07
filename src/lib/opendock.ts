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
  role: string | null; // the tag's role prefix, e.g. "Receiver" / "Loader"
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

// Which status wins when someone is tagged on more than one appointment.
const TONE_RANK: Record<DockTone, number> = {
  active: 4,
  arrived: 3,
  scheduled: 2,
  done: 1,
  other: 0,
};

// ---- Opendock API client --------------------------------------------------
// Shapes confirmed against a live Neutron response. An appointment carries a
// `dockId` (not a warehouseId) and free-text `tags`; the dock record is what
// ties a door back to a warehouse.
type RawAppt = {
  id?: string;
  status?: string;
  dockId?: string;
  start?: string;
  end?: string;
  tags?: unknown; // string[] | { name?: string; value?: string }[]
  [k: string]: unknown;
};

type RawDock = {
  id?: string;
  name?: string;
  doorNumber?: string;
  warehouseId?: string;
  [k: string]: unknown;
};

// Every free-text tag on an appointment. Handles plain strings or objects with
// a name/value.
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

// Tags are "<role>: <value>" — warehouse staff write "Receiver: Dennis",
// "Loader: Dennis" for the people on a load, and "DOOR: 23" for the door. A tag
// with no colon is treated as a bare value.
export type ParsedTag = { role: string | null; value: string };

function parseTag(tag: string): ParsedTag {
  const i = tag.indexOf(":");
  if (i === -1) return { role: null, value: tag.trim() };
  return { role: tag.slice(0, i).trim() || null, value: tag.slice(i + 1).trim() };
}

// Role prefixes that label a door rather than a person.
const DOOR_ROLE = /^(door|dock|bay)$/i;

const isDoorTag = (t: ParsedTag) => !!t.role && DOOR_ROLE.test(t.role);

function parsedTags(appt: RawAppt): ParsedTag[] {
  return tagStrings(appt).map(parseTag).filter((t) => t.value);
}

// The live door the truck is actually at, which beats the dock record's
// configured door number.
function doorFromTags(appt: RawAppt): string | null {
  return parsedTags(appt).find(isDoorTag)?.value ?? null;
}

// Everything that isn't a door tag is a candidate person.
function personTags(appt: RawAppt): ParsedTag[] {
  return parsedTags(appt).filter((t) => !isDoorTag(t));
}

// ---- Matching a tag value to an employee -----------------------------------
// Tags often carry only a first name ("Receiver: Dennis") while the roster has
// full names ("Dennis Kowalski"). Resolution order: exact full name, then a
// unique first-name match, then a unique last-name match. Ambiguous matches
// (two Dennises) resolve to nothing rather than risk showing one person's dock
// status on someone else's badge.
export type NameIndex = {
  full: Map<string, string>;
  first: Map<string, string[]>;
  last: Map<string, string[]>;
};

export function buildNameIndex(names: string[]): NameIndex {
  const full = new Map<string, string>();
  const first = new Map<string, string[]>();
  const last = new Map<string, string[]>();
  const push = (m: Map<string, string[]>, k: string, v: string) => {
    if (!k) return;
    const arr = m.get(k);
    if (arr) arr.push(v);
    else m.set(k, [v]);
  };
  for (const name of names) {
    const n = norm(name);
    if (!n) continue;
    full.set(n, name);
    const parts = n.split(" ");
    push(first, parts[0], name);
    if (parts.length > 1) push(last, parts[parts.length - 1], name);
  }
  return { full, first, last };
}

export function resolveEmployee(value: string, idx: NameIndex): string | null {
  const v = norm(value);
  if (!v) return null;
  const exact = idx.full.get(v);
  if (exact) return exact;
  if (v.includes(" ")) return null; // a full-looking name that isn't on the roster
  const byFirst = idx.first.get(v);
  if (byFirst?.length === 1) return byFirst[0];
  if (byFirst && byFirst.length > 1) return null; // ambiguous — don't guess
  const byLast = idx.last.get(v);
  if (byLast?.length === 1) return byLast[0];
  return null;
}

function dockLabel(appt: RawAppt, docks: Map<string, RawDock>): string | null {
  const fromTag = doorFromTags(appt);
  if (fromTag) return fromTag;
  const dock = appt.dockId ? docks.get(String(appt.dockId)) : undefined;
  return dock?.doorNumber ?? dock?.name ?? null;
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

// NOTE ON SCOPING: an appointment has no warehouseId — passing `?warehouseId=`
// is silently ignored (it returns the whole org), and a crud `s` filter on it
// 400s as a non-existent attribute. The warehouse link lives on the DOCK, so we
// resolve the warehouse's docks first and scope appointments to those dock IDs.
// With four warehouses on this org, skipping that would leak other sites' docks
// onto the board.

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

async function getJson(url: string, token: string): Promise<unknown | null> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

// The warehouse's docks, keyed by dock id. Filtered client-side on
// dock.warehouseId, which is the field that actually carries the link.
async function fetchDocks(
  cfg: OpendockConfigFull,
  token: string
): Promise<Map<string, RawDock>> {
  const body = await getJson(`${cfg.baseUrl}/dock?limit=500`, token);
  const rows = apptsFrom(body) as RawDock[];
  const map = new Map<string, RawDock>();
  for (const d of rows) {
    if (d.id && d.warehouseId === cfg.warehouseId) map.set(String(d.id), d);
  }
  return map;
}

// Appointments for the given docks, within a window around now. Tries the
// nestjs-crud `s` filter on real attributes (dockId/start) so the API does the
// work; falls back to an unfiltered page if that's rejected. Either way the
// result is filtered locally, so a silently-ignored filter can't leak another
// warehouse's appointments onto the board.
async function fetchAppointments(
  cfg: OpendockConfigFull,
  token: string,
  dockIds: string[],
  now: Date
): Promise<RawAppt[]> {
  if (dockIds.length === 0) return [];
  const from = new Date(now.getTime() - 12 * 3600_000).toISOString();
  const to = new Date(now.getTime() + 12 * 3600_000).toISOString();

  const filtered = new URLSearchParams({
    s: JSON.stringify({
      dockId: { $in: dockIds },
      start: { $gte: from, $lte: to },
    }),
    limit: "500",
  });

  let rows = apptsFrom(
    await getJson(`${cfg.baseUrl}/appointment?${filtered}`, token)
  );
  if (rows.length === 0) {
    // Either the filter was rejected or genuinely matched nothing — retry
    // unfiltered and narrow locally.
    rows = apptsFrom(await getJson(`${cfg.baseUrl}/appointment?limit=500`, token));
  }

  const allowed = new Set(dockIds);
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
  return rows.filter((a) => {
    if (!a.dockId || !allowed.has(String(a.dockId))) return false;
    const startMs = a.start ? Date.parse(String(a.start)) : NaN;
    return Number.isNaN(startMs) || (startMs >= fromMs && startMs <= toMs);
  });
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
    if (!cfg.enabled || !cfg.baseUrl || !cfg.email || !cfg.password || !cfg.warehouseId) {
      cache.set(locationId, { at: Date.now(), byName });
      return byName;
    }
    const token = await login(cfg);
    if (!token) throw new Error("Opendock login failed");
    const now = new Date();
    const docks = await fetchDocks(cfg, token);
    const appts = await fetchAppointments(cfg, token, [...docks.keys()], now);
    const roster = await prisma.employee.findMany({
      where: { terminatedAt: null },
      select: { name: true },
    });
    const index = buildNameIndex(roster.map((e) => e.name));

    // When one employee is tagged on several appointments, show the one that
    // matters now: in-progress beats arrived beats scheduled beats finished.
    const best: Record<string, { status: DockStatus; rank: number }> = {};
    for (const appt of appts) {
      if (!appt.status) continue;
      const { label, tone } = mapStatus(String(appt.status));
      const dock = dockLabel(appt, docks);
      for (const tag of personTags(appt)) {
        const employee = resolveEmployee(tag.value, index);
        if (!employee) continue;
        const key = norm(employee);
        const prev = best[key];
        if (!prev || TONE_RANK[tone] > prev.rank) {
          best[key] = {
            status: { label, dock, tone, role: tag.role },
            rank: TONE_RANK[tone],
          };
        }
      }
    }
    for (const [key, v] of Object.entries(best)) byName[key] = v.status;
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

// What the live badge sync actually resolves, run end-to-end. This is the part
// that answers "why are no pills showing?" — most often because the
// appointments carry no employee-name tags to match against.
export type PipelineCheck = {
  docksInWarehouse: number;
  appointmentsInWindow: number;
  doorTags: string[]; // distinct "DOOR: 23"-style tags
  unmatchedTags: string[]; // person tags with no employee on the roster
  employees: number;
  matchedEmployees: string[]; // "Receiver: Dennis → Dennis Kowalski"
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
  pipeline: PipelineCheck | null;
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
    pipeline: null,
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

  // Run the real sync end-to-end and report what it resolved.
  if (cfg.warehouseId) {
    try {
      const now = new Date();
      const docks = await fetchDocks(cfg, token);
      const appts = await fetchAppointments(cfg, token, [...docks.keys()], now);
      const roster = await prisma.employee.findMany({
        where: { terminatedAt: null },
        select: { name: true },
      });
      const index = buildNameIndex(roster.map((e) => e.name));

      const doorTags = new Set<string>();
      const matched = new Set<string>();
      const unmatched = new Set<string>();
      for (const a of appts) {
        for (const t of parsedTags(a)) {
          if (isDoorTag(t)) {
            doorTags.add(t.value);
            continue;
          }
          const employee = resolveEmployee(t.value, index);
          const shown = t.role ? `${t.role}: ${t.value}` : t.value;
          if (employee) matched.add(`${shown} → ${employee}`);
          else unmatched.add(shown);
        }
      }
      out.pipeline = {
        docksInWarehouse: docks.size,
        appointmentsInWindow: appts.length,
        doorTags: [...doorTags].slice(0, 25),
        unmatchedTags: [...unmatched].slice(0, 25),
        employees: roster.length,
        matchedEmployees: [...matched].slice(0, 25),
      };
    } catch {
      /* diagnostic extra — never fail the whole test over it */
    }
  }

  return out;
}

// The normaliser, exported so the board can look up a status by employee name.
export const normalizeName = norm;
