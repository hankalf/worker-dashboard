import { prisma, getActiveLocationId } from "@/lib/prisma";
import { easternDateKey, easternInputToUtcISO } from "@/lib/time";

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
  windowHours: "opendock.windowHours",
  personRoles: "opendock.personRoles",
  aliases: "opendock.aliases",
  fontScale: "opendock.fontScale",
  refreshSeconds: "opendock.refreshSeconds",
} as const;

// Text size of the dock schedule panel, as a percentage. Applied like browser
// zoom so the table reflows instead of clipping.
export const DOCK_FONT_MIN = 75;
export const DOCK_FONT_MAX = 200;
export const DOCK_FONT_DEFAULT = 100;

// Poll interval in seconds, bounded so a typo can't hammer Opendock.
export function clampRefresh(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_REFRESH_SECONDS;
  return Math.min(MAX_REFRESH_SECONDS, Math.max(MIN_REFRESH_SECONDS, n));
}

export function clampDockFontScale(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return DOCK_FONT_DEFAULT;
  return Math.min(DOCK_FONT_MAX, Math.max(DOCK_FONT_MIN, n));
}

// How far either side of now an appointment can sit and still show on a badge.
// Crews often tag the next shift's loads, so this needs headroom.
const DEFAULT_WINDOW_HOURS = 24;

// Tag roles that name a person, e.g. "RECEIVER: DENNIS R.".
const DEFAULT_PERSON_ROLES = "receiver, loader";

// How often the board actually calls Opendock. The board re-renders every 15s,
// but data is served from cache in between, so this is the real poll rate.
const DEFAULT_REFRESH_SECONDS = 120;
const MIN_REFRESH_SECONDS = 30;
const MAX_REFRESH_SECONDS = 900;

export type OpendockConfig = {
  enabled: boolean;
  baseUrl: string;
  email: string;
  warehouseId: string;
  windowHours: number;
  personRoles: string;
  aliases: string;
  fontScale: number;
  refreshSeconds: number;
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
    windowHours: Number(m[KEY.windowHours]) || DEFAULT_WINDOW_HOURS,
    personRoles: m[KEY.personRoles] ?? DEFAULT_PERSON_ROLES,
    aliases: m[KEY.aliases] ?? "",
    fontScale: m[KEY.fontScale]
      ? clampDockFontScale(m[KEY.fontScale])
      : DOCK_FONT_DEFAULT,
    refreshSeconds: clampRefresh(m[KEY.refreshSeconds]),
  };
}

// "receiver, loader" -> ["receiver", "loader"]
export function parsePersonRoles(raw: string): string[] {
  return raw
    .split(/[,\n]/)
    .map((s) => s.trim().toLowerCase().replace(/:$/, ""))
    .filter(Boolean);
}

// Manual tag-to-employee overrides, one per line: "JB = Jose Barrera".
// For nicknames, initials, and names two people share.
export function parseAliases(raw: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of raw.split(/\n/)) {
    const i = line.indexOf("=");
    if (i === -1) continue;
    const from = line.slice(0, i).trim().toLowerCase();
    const to = line.slice(i + 1).trim();
    if (from && to) map.set(from, to);
  }
  return map;
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
    windowHours: c.windowHours,
    personRoles: c.personRoles,
    aliases: c.aliases,
    fontScale: c.fontScale,
    refreshSeconds: c.refreshSeconds,
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
  windowHours?: number;
  personRoles?: string;
  aliases?: string;
  fontScale?: number;
  refreshSeconds?: number;
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
  if (input.windowHours !== undefined) {
    const h = Math.min(Math.max(Math.round(input.windowHours) || 0, 1), 168);
    await set(KEY.windowHours, String(h));
  }
  if (input.personRoles !== undefined) await set(KEY.personRoles, input.personRoles);
  if (input.aliases !== undefined) await set(KEY.aliases, input.aliases);
  if (input.fontScale !== undefined)
    await set(KEY.fontScale, String(clampDockFontScale(input.fontScale)));
  if (input.refreshSeconds !== undefined)
    await set(KEY.refreshSeconds, String(clampRefresh(input.refreshSeconds)));
  if (input.password) await set(KEY.password, input.password);
}

// ---- Status model shown on the badge --------------------------------------

// Colour tone for the pill; mapped from Opendock's raw status. "requested" is
// kept distinct from "scheduled" (it's pre-approval) so a display can hide one
// without the other.
export type DockTone =
  | "requested"
  | "scheduled"
  | "arrived"
  | "active"
  | "done"
  | "other";

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
  if (s.includes("requested")) return { label: "Requested", tone: "requested" };
  if (s.includes("schedul") || s.includes("booked") || s.includes("pending"))
    return { label: "Scheduled", tone: "scheduled" };
  return { label: raw, tone: "other" };
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

// Which status wins when someone is tagged on more than one appointment.
const TONE_RANK: Record<DockTone, number> = {
  active: 5,
  arrived: 4,
  scheduled: 3,
  requested: 2,
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

function isDoorTag(t: ParsedTag) {
  return !!t.role && DOOR_ROLE.test(t.role);
}

function parsedTags(appt: RawAppt): ParsedTag[] {
  return tagStrings(appt).map(parseTag).filter((t) => t.value);
}

// The live door the truck is actually at, which beats the dock record's
// configured door number.
function doorFromTags(appt: RawAppt): string | null {
  return parsedTags(appt).find(isDoorTag)?.value ?? null;
}

// Only tags carrying a configured person role name a person. Boards use tags
// for plenty of other things — "ASN", "Pending Reschedule", "PICK IN PROGRESS",
// "Once Upon a Farm", "PID: 9514" — and an allow-list of roles is far more
// reliable than trying to enumerate all the noise.
function isPersonRole(role: string | null, roles: string[]): boolean {
  return !!role && roles.includes(role.trim().toLowerCase());
}

function personTags(appt: RawAppt, roles: string[]): ParsedTag[] {
  return parsedTags(appt).filter((t) => isPersonRole(t.role, roles));
}

// ---- Matching a tag value to an employee -----------------------------------
// Opendock tags are written by hand and rarely match the roster exactly. Real
// examples: "DENNIS R." (first name + last initial), "MIKE" (first name only),
// "MICHAEL R." — all upper-case, sometimes with a trailing period. The roster
// holds full names like "Dennis Rodriguez".
//
// Resolution order (first hit wins):
//   1. exact name
//   2. first name + last initial  — "DENNIS R." -> Dennis Rodriguez
//   3. first name + last name     — "DENNIS RODRIGUEZ"
//   4. unique first name          — "MIKE" -> Mike Alvarez (only if one Mike)
//   5. unique last name           — "RODRIGUEZ"
// Anything ambiguous (two Mikes, two Dennis R.s) resolves to nothing rather
// than risk showing one person's dock status on someone else's badge.

// Comparison form: lower-case, punctuation dropped, spaces collapsed. This is
// what makes "DENNIS R." and "Dennis R" compare equal.
const canon = (s: string) =>
  s
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// `rest` is every token after the first, so a last initial can match either
// surname of a two-surname name ("Josue Aguilar Madrigal" answers to "JOSUE A."
// and "JOSUE M.").
type NameEntry = {
  name: string;
  first: string;
  last: string | null;
  rest: string[];
};

export type NameIndex = {
  full: Map<string, string>;
  entries: NameEntry[];
};

export function buildNameIndex(names: string[]): NameIndex {
  const full = new Map<string, string>();
  const entries: NameEntry[] = [];
  for (const name of names) {
    const c = canon(name);
    if (!c) continue;
    if (!full.has(c)) full.set(c, name);
    const parts = c.split(" ");
    entries.push({
      name,
      first: parts[0],
      last: parts.length > 1 ? parts[parts.length - 1] : null,
      rest: parts.slice(1),
    });
  }
  return { full, entries };
}

// Why a tag didn't resolve — surfaced in the admin diagnostic so a bad tag is
// easy to act on.
export type MatchResult =
  | { name: string; reason: null }
  | { name: null; reason: "no-match" | "ambiguous"; candidates: string[] };

const nameOf = (r: MatchResult) => r.name;

// Everyone matching `pred`. One distinct name = a match; several = ambiguous.
function pick(entries: NameEntry[], pred: (e: NameEntry) => boolean): MatchResult | null {
  const names = [...new Set(entries.filter(pred).map((e) => e.name))];
  if (names.length === 1) return { name: names[0], reason: null };
  if (names.length > 1)
    return { name: null, reason: "ambiguous", candidates: names };
  return null; // no hits — let the caller try the next strategy
}

export function matchEmployee(
  value: string,
  idx: NameIndex,
  aliases?: Map<string, string>
): MatchResult {
  const miss: MatchResult = { name: null, reason: "no-match", candidates: [] };
  let c = canon(value);
  if (!c) return miss;

  // A manual alias wins outright — it's the admin's explicit answer for
  // nicknames ("JB"), initials, and names two people share.
  const alias = aliases?.get(c) ?? aliases?.get(value.trim().toLowerCase());
  if (alias) {
    const target = idx.full.get(canon(alias));
    if (target) return { name: target, reason: null };
    c = canon(alias); // fall through and resolve the alias like a normal tag
  }

  const exact = idx.full.get(c);
  if (exact) return { name: exact, reason: null };

  const tokens = c.split(" ");
  const first = tokens[0];
  const tail = tokens[tokens.length - 1];
  const isInitial = tokens.length > 1 && tail.length === 1;

  // "dennis r" — first name plus a last initial. The most common tag form.
  // The initial may match any surname, so "JOSUE A." finds Josue Aguilar
  // Madrigal as well as Josue Alvarez.
  if (isInitial) {
    const hit = pick(
      idx.entries,
      (e) => e.first === first && e.rest.some((p) => p.startsWith(tail))
    );
    if (hit) return hit;
  }

  // "dennis rodriguez" — first plus any surname, tolerating middle names.
  if (tokens.length > 1 && !isInitial) {
    const hit = pick(
      idx.entries,
      (e) => e.first === first && e.rest.includes(tail)
    );
    if (hit) return hit;
  }

  // First name alone. Allowed for a bare "MIKE", and for "DENNIS R." when the
  // roster only carries "Dennis" — but NOT for longer free text, so a note like
  // "Mike said the reefer was off" can never land on Mike's badge.
  if (tokens.length === 1 || isInitial) {
    const hit = pick(idx.entries, (e) => e.first === first);
    if (hit) return hit;
  }

  // A bare surname.
  if (tokens.length === 1) {
    const hit = pick(idx.entries, (e) => e.last === first);
    if (hit) return hit;
  }

  return miss;
}

export function resolveEmployee(value: string, idx: NameIndex): string | null {
  return nameOf(matchEmployee(value, idx));
}

// Levenshtein distance, for "did you mean" hints on unmatched tags.
function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(
        prev[j] + 1,
        prev[j - 1] + 1,
        diag + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      diag = tmp;
    }
  }
  return prev[b.length];
}

// Roster names whose first name is a near miss for the tag — a mistyped or
// nickname'd tag ("JIMMY" vs "James Lopez") shows up as a suggestion instead of
// a dead end.
export function nearestNames(value: string, roster: string[], max = 2): string[] {
  const first = canon(value).split(" ")[0];
  if (first.length < 3) return [];
  const scored: { name: string; d: number }[] = [];
  for (const name of roster) {
    const cand = canon(name).split(" ")[0];
    const d = editDistance(first, cand);
    // Allow more slack for longer names, and treat a prefix as very close.
    const limit = first.length <= 4 ? 1 : 2;
    if (d <= limit || cand.startsWith(first) || first.startsWith(cand)) {
      scored.push({ name, d });
    }
  }
  return scored
    .sort((x, y) => x.d - y.d)
    .slice(0, max)
    .map((s) => s.name);
}

// The door is whatever the "DOOR: n" tag says, and nothing else. The dock
// record's own name/doorNumber describes the bay's configuration ("Inbound Raw
// Material #A" / "A# 1007"), not where this truck was actually sent, so falling
// back to it put the wrong value on the board.
function dockLabel(appt: RawAppt): string | null {
  return doorFromTags(appt);
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

// ---- Auth: log in rarely, reuse the token ---------------------------------
// Opendock issues a long-lived JWT (its `expires_in` is measured in days) and
// counts failed sign-ins against the account. Logging in on every poll would
// mean thousands of sign-ins a day and get the account throttled or locked, so
// the token is cached and reused until shortly before it expires.

type TokenEntry = { token: string; expiresAt: number };
const tokenCache = new Map<string, TokenEntry>();
// After a failed login, wait before trying again rather than hammering.
const loginBackoff = new Map<string, number>();

const LOGIN_BACKOFF_MS = 5 * 60_000;
// Never hold a token longer than this, even if Opendock says it lives longer.
const MAX_TOKEN_LIFE_MS = 12 * 3600_000;
// Renew this long before expiry so a request never races the deadline.
const TOKEN_SKEW_MS = 5 * 60_000;

// One fresh sign-in. Returns the token and how long Opendock says it lasts.
async function loginFresh(
  cfg: OpendockConfigFull
): Promise<{ token: string; expiresInMs: number } | null> {
  const res = await fetch(`${cfg.baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: cfg.email, password: cfg.password }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return null;
  const body = await res.json().catch(() => ({}));
  const token = tokenFrom(body);
  if (!token) return null;
  const secs = Number((body as { expires_in?: unknown })?.expires_in);
  return {
    token,
    expiresInMs: Number.isFinite(secs) && secs > 0 ? secs * 1000 : MAX_TOKEN_LIFE_MS,
  };
}

// A usable bearer token — from cache when possible. Null while backing off from
// a recent failure, so a bad password can't turn into a sign-in storm.
async function login(cfg: OpendockConfigFull): Promise<string | null> {
  const key = `${cfg.baseUrl}|${cfg.email}`;
  const now = Date.now();

  const hit = tokenCache.get(key);
  if (hit && now < hit.expiresAt) return hit.token;

  const retryAt = loginBackoff.get(key);
  if (retryAt && now < retryAt) return null;

  const fresh = await loginFresh(cfg).catch(() => null);
  if (!fresh) {
    loginBackoff.set(key, now + LOGIN_BACKOFF_MS);
    return null;
  }
  loginBackoff.delete(key);
  tokenCache.set(key, {
    token: fresh.token,
    expiresAt:
      now + Math.max(60_000, Math.min(fresh.expiresInMs, MAX_TOKEN_LIFE_MS) - TOKEN_SKEW_MS),
  });
  return fresh.token;
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
const PAGE_LIMIT = 500;

// Appointments for the given docks within [from, to]. The date range goes into
// the query — `start` and `dockId` are both real attributes, so the API can do
// the filtering. That matters: without it a busy warehouse fills the 500-row
// page with far-future bookings and the current shift never comes back.
async function fetchAppointments(
  cfg: OpendockConfigFull,
  token: string,
  dockIds: string[],
  from: Date,
  to: Date
): Promise<RawAppt[]> {
  if (dockIds.length === 0) return [];
  const url = (s: object) =>
    `${cfg.baseUrl}/appointment?` +
    new URLSearchParams({ s: JSON.stringify(s), limit: String(PAGE_LIMIT) });

  const ranged = {
    dockId: { $in: dockIds },
    start: { $gte: from.toISOString(), $lte: to.toISOString() },
  };

  let rows = apptsFrom(await getJson(url(ranged), token));
  if (rows.length === 0) {
    // The ranged filter was rejected or matched nothing — widen, then fall all
    // the way back to an unfiltered page.
    rows = apptsFrom(await getJson(url({ dockId: { $in: dockIds } }), token));
  }
  if (rows.length === 0) {
    rows = apptsFrom(
      await getJson(`${cfg.baseUrl}/appointment?limit=${PAGE_LIMIT}`, token)
    );
  }

  // Re-apply both constraints locally, so a filter the API ignored can never
  // widen the scope.
  const allowed = new Set(dockIds);
  return rows.filter(
    (a) => !!a.dockId && allowed.has(String(a.dockId)) && within(a, from, to)
  );
}

function within(a: RawAppt, from: Date, to: Date): boolean {
  const startMs = a.start ? Date.parse(String(a.start)) : NaN;
  if (Number.isNaN(startMs)) return true; // undated — don't hide it
  return startMs >= from.getTime() && startMs <= to.getTime();
}

// The badge window: `hours` either side of now.
function windowRange(now: Date, hours: number): [Date, Date] {
  return [
    new Date(now.getTime() - hours * 3600_000),
    new Date(now.getTime() + hours * 3600_000),
  ];
}

// ---- Cache: don't hit Opendock on every 15s board refresh ------------------
type CacheEntry = { at: number; byName: Record<string, DockStatus> };
const cache = new Map<string, CacheEntry>();

// A name→status map for the active location's employees. Keyed by the tag text
// (normalised), so a badge match is a simple lookup by employee name. Returns
// {} when Opendock is off/misconfigured/unreachable — the board is never
// blocked by it.
export async function getEmployeeDockStatuses(): Promise<Record<string, DockStatus>> {
  const locationId = (await getActiveLocationId()) ?? "default";
  const hit = cache.get(locationId);
  const cfgForTtl = await fullConfig();
  if (hit && Date.now() - hit.at < cfgForTtl.refreshSeconds * 1000)
    return hit.byName;

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
    const [from, to] = windowRange(now, cfg.windowHours);
    const docks = await fetchDocks(cfg, token);
    const appts = await fetchAppointments(cfg, token, [...docks.keys()], from, to);
    const roster = await prisma.employee.findMany({
      where: { terminatedAt: null },
      select: { name: true },
    });
    const index = buildNameIndex(roster.map((e) => e.name));
    const roles = parsePersonRoles(cfg.personRoles);
    const aliases = parseAliases(cfg.aliases);

    // When one employee is tagged on several appointments, show the one that
    // matters now: in-progress beats arrived beats scheduled beats finished.
    const best: Record<string, { status: DockStatus; rank: number }> = {};
    for (const appt of appts) {
      if (!appt.status) continue;
      const { label, tone } = mapStatus(String(appt.status));
      const dock = dockLabel(appt);
      for (const tag of personTags(appt, roles)) {
        const employee = matchEmployee(tag.value, index, aliases).name;
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
  scheduleCache.clear();
  // Credentials may have changed — force a fresh sign-in and clear any backoff.
  tokenCache.clear();
  loginBackoff.clear();
}

// ---- Today's dock schedule (the wall-display view) -------------------------

// Column sources are fixed by the warehouse's mapping:
//   scheduled   appointment.start
//   completed   appointment.end
//   status      appointment.status
//   door        the "DOOR: n" tag only — never the dock record
//   PO #        appointment.refNumber
//   direction   loadType.direction
//   tags        the appointment's loader/receiver tags
export type ScheduleEntry = {
  id: string;
  scheduledAt: string | null; // appointment.start
  completedAt: string | null; // appointment.end
  status: string; // raw Opendock status, e.g. "Arrived"
  label: string; // friendly label
  tone: DockTone;
  door: string | null; // from the "DOOR: 23" tag, blank when untagged
  poNumber: string | null; // appointment.refNumber
  direction: string | null; // Inbound / Outbound, from the load type
  tags: string[]; // loader/receiver tags (the door tag has its own column)
};

export type DockSchedule = {
  enabled: boolean;
  date: string; // Eastern "YYYY-MM-DD"
  entries: ScheduleEntry[];
  error: string | null;
  fontScale: number; // percent, applied to the panel like browser zoom
};

type RawLoadType = {
  id?: string;
  name?: string;
  direction?: string;
  [k: string]: unknown;
};

// Load types for the org, keyed by id. Carries the load's name and its
// direction (inbound/outbound), which the appointment itself doesn't hold.
async function fetchLoadTypes(
  cfg: OpendockConfigFull,
  token: string
): Promise<Map<string, RawLoadType>> {
  const body = await getJson(`${cfg.baseUrl}/loadType?limit=500`, token);
  const map = new Map<string, RawLoadType>();
  for (const lt of apptsFrom(body) as RawLoadType[]) {
    if (lt.id) map.set(String(lt.id), lt);
  }
  return map;
}

// Direction as Opendock reports it, falling back to reading it out of the load
// type's name ("Inbound Raw Material") when the field isn't present.
function directionOf(lt: RawLoadType | undefined): string | null {
  if (!lt) return null;
  const raw =
    (typeof lt.direction === "string" && lt.direction) ||
    (typeof lt.type === "string" && lt.type) ||
    "";
  const from = raw || String(lt.name ?? "");
  const s = from.toLowerCase();
  if (s.includes("outbound") || s === "out") return "Outbound";
  if (s.includes("inbound") || s === "in") return "Inbound";
  return raw ? raw : null;
}


type ScheduleCacheEntry = { at: number; value: DockSchedule };
const scheduleCache = new Map<string, ScheduleCacheEntry>();

// Every appointment on the active location's docks for the given Eastern day,
// oldest first. Safe by construction: any failure returns an empty schedule
// with an error message rather than throwing at the screen.
export async function getDockSchedule(now = new Date()): Promise<DockSchedule> {
  const locationId = (await getActiveLocationId()) ?? "default";
  const date = easternDateKey(now);
  const key = `${locationId}:${date}`;
  const hit = scheduleCache.get(key);
  const cfgForTtl = await fullConfig();
  if (hit && Date.now() - hit.at < cfgForTtl.refreshSeconds * 1000) return hit.value;

  const empty = (error: string | null, fontScale = DOCK_FONT_DEFAULT): DockSchedule => ({
    enabled: false,
    date,
    entries: [],
    error,
    fontScale,
  });

  let value: DockSchedule;
  try {
    const cfg = await fullConfig();
    if (!cfg.enabled || !cfg.baseUrl || !cfg.email || !cfg.password || !cfg.warehouseId) {
      value = empty(null, cfg.fontScale); // not configured — the view says so
    } else {
      const token = await login(cfg);
      if (!token) throw new Error("Opendock login failed");
      const from = new Date(easternInputToUtcISO(`${date}T00:00`));
      const to = new Date(easternInputToUtcISO(`${date}T23:59`));
      const docks = await fetchDocks(cfg, token);
      const [appts, loadTypes] = await Promise.all([
        fetchAppointments(cfg, token, [...docks.keys()], from, to),
        fetchLoadTypes(cfg, token),
      ]);

      const entries: ScheduleEntry[] = appts.map((appt) => {
        const raw = String(appt.status ?? "");
        const { label, tone } = mapStatus(raw);
        const lt = appt.loadTypeId ? loadTypes.get(String(appt.loadTypeId)) : undefined;

        return {
          id: String(appt.id ?? `${appt.dockId}-${appt.start}`),
          scheduledAt: appt.start ? String(appt.start) : null,
          completedAt: appt.end ? String(appt.end) : null,
          status: raw,
          label,
          tone,
          door: doorFromTags(appt),
          poNumber:
            typeof appt.refNumber === "string" && appt.refNumber ? appt.refNumber : null,
          direction: directionOf(lt),
          // The door tag has its own column, so don't repeat it here.
          tags: parsedTags(appt)
            .filter((t) => !isDoorTag(t))
            .map((t) => (t.role ? `${t.role}: ${t.value}` : t.value)),
        };
      });

      entries.sort((a, b) => (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? ""));
      value = { enabled: true, date, entries, error: null, fontScale: cfg.fontScale };
    }
  } catch (e) {
    console.error("[opendock] schedule fetch failed:", (e as Error).message);
    value = { ...empty((e as Error).message), enabled: true };
  }

  scheduleCache.set(key, { at: Date.now(), value });
  return value;
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
  unmatchedTags: string[]; // person tags that didn't resolve, with the reason
  ignoredTags: number; // reference/paperwork tags skipped outright
  employees: number;
  matchedEmployees: string[]; // "RECEIVER: DENNIS R. → Dennis Rodriguez"
  windowHours: number;
  appointmentsTotal: number; // for this warehouse, any date
  taggedOutsideWindow: string[]; // person tags on appointments outside the window
  // Every candidate value the board could show for one real appointment, so a
  // column can be pointed at the right source without guessing.
  columnSources: Record<string, string> | null;
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
    { label: "loadType (name + direction)", url: `${b}/loadType?limit=5` },
    { label: "warehouse (list mine)", url: `${b}/warehouse?limit=5` },
    { label: "who am I", url: `${b}/user/me` },
  ];
}

// Lay out every value the dock schedule could draw on for a single real
// appointment — the raw fields, the resolved dock, the load type, and each
// custom field — so columns can be mapped against actual data.
function describeSources(
  appt: RawAppt | undefined,
  docks: Map<string, RawDock>,
  loadTypes: Map<string, RawLoadType>
): Record<string, string> | null {
  if (!appt) return null;
  const out: Record<string, string> = {};
  const put = (k: string, v: unknown) => {
    if (v === null || v === undefined || v === "") return;
    out[k] = typeof v === "string" ? v : JSON.stringify(v);
  };

  put("appointment.start", appt.start);
  put("appointment.end", appt.end);
  put("appointment.status", appt.status);
  put("appointment.statusTimeline", appt.statusTimeline);
  put("appointment.refNumber", appt.refNumber);
  put("appointment.refNumbers", appt.refNumbers);
  put("appointment.confirmationNumber", appt.confirmationNumber);
  put("appointment.type", appt.type);
  put("appointment.notes", appt.notes);
  put("appointment.eta", appt.eta);
  put("appointment.tags", appt.tags);
  put("appointment.dockId", appt.dockId);

  const dock = appt.dockId ? docks.get(String(appt.dockId)) : undefined;
  put("dock.name", dock?.name);
  put("dock.doorNumber", dock?.doorNumber);

  const lt = appt.loadTypeId ? loadTypes.get(String(appt.loadTypeId)) : undefined;
  put("loadType.name", lt?.name);
  put("loadType.direction", lt?.direction);
  put("loadType.(all fields)", lt ? Object.keys(lt).join(", ") : undefined);

  // Custom fields are per-warehouse, so list them by their visible label.
  if (Array.isArray(appt.customFields)) {
    for (const f of appt.customFields as {
      label?: string;
      name?: string;
      value?: unknown;
    }[]) {
      const label = f.label ?? f.name;
      if (label && f.value !== undefined && f.value !== "") {
        put(`customField["${label}"]`, f.value);
      }
    }
  }

  put("→ door currently shown", dockLabel(appt));
  return out;
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
    // A real sign-in, bypassing the token cache: the point of this button is to
    // verify the credentials right now.
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
      const dockIds = [...docks.keys()];
      const [from, to] = windowRange(now, cfg.windowHours);
      const appts = await fetchAppointments(cfg, token, dockIds, from, to);
      const loadTypes = await fetchLoadTypes(cfg, token);
      // A wider sweep, so we can say whether the tags you expect are simply
      // sitting outside the badge window.
      const [wideFrom, wideTo] = windowRange(now, 24 * 7);
      const wide = await fetchAppointments(cfg, token, dockIds, wideFrom, wideTo);

      const roster = await prisma.employee.findMany({
        where: { terminatedAt: null },
        select: { name: true },
      });
      const index = buildNameIndex(roster.map((e) => e.name));
      const roles = parsePersonRoles(cfg.personRoles);
      const aliases = parseAliases(cfg.aliases);

      const inWindowIds = new Set(appts.map((a) => a.id));
      const outside = new Set<string>();
      for (const a of wide) {
        if (inWindowIds.has(a.id)) continue;
        for (const t of personTags(a, roles)) {
          outside.add(t.role ? `${t.role}: ${t.value}` : t.value);
        }
      }

      const doorTags = new Set<string>();
      const matched = new Set<string>();
      const unmatched = new Set<string>();
      let ignored = 0;
      for (const a of appts) {
        for (const t of parsedTags(a)) {
          if (isDoorTag(t)) {
            doorTags.add(t.value);
            continue;
          }
          if (!isPersonRole(t.role, roles)) {
            ignored++;
            continue;
          }
          const shown = t.role ? `${t.role}: ${t.value}` : t.value;
          const res = matchEmployee(t.value, index, aliases);
          if (res.name) {
            matched.add(`${shown} → ${res.name}`);
          } else if (res.reason === "ambiguous") {
            unmatched.add(`${shown} — ambiguous (${res.candidates.join(", ")})`);
          } else {
            const near = nearestNames(t.value, roster.map((e) => e.name));
            unmatched.add(
              near.length
                ? `${shown} — no match (did you mean ${near.join(" / ")}?)`
                : `${shown} — nobody on the roster`
            );
          }
        }
      }
      out.pipeline = {
        docksInWarehouse: docks.size,
        appointmentsInWindow: appts.length,
        doorTags: [...doorTags].slice(0, 25),
        unmatchedTags: [...unmatched].slice(0, 25),
        ignoredTags: ignored,
        employees: roster.length,
        matchedEmployees: [...matched].slice(0, 40),
        windowHours: cfg.windowHours,
        appointmentsTotal: wide.length,
        taggedOutsideWindow: [...outside].slice(0, 25),
        columnSources: describeSources(appts[0] ?? wide[0], docks, loadTypes),
      };
    } catch {
      /* diagnostic extra — never fail the whole test over it */
    }
  }

  return out;
}

// The normaliser, exported so the board can look up a status by employee name.
export const normalizeName = norm;
