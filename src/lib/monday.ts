// Monday.com board → employee roster sync (per location).
//
// Config lives in LocationSetting under monday.* keys, alongside the Opendock
// integration. One row on the board is one person; the row's title is their
// name unless a name column is mapped. The sync adds people who appear,
// updates the ones it already knows, and terminates the ones that disappear.
//
// NOTE: the Monday API is GraphQL at a single endpoint. The query shapes below
// follow Monday's documented `items_page` cursor pagination. The API version is
// configurable rather than hard-coded because Monday dates its versions and
// retires old ones — if a response shape changes, set a newer version in
// Settings rather than editing this file. Test connection returns the raw
// response so the real shape can be checked against a live board.

import { prisma, getActiveLocationId } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import {
  mapRow,
  planSync,
  describePlan,
  type MappedPerson,
  type SyncPlan,
} from "@/lib/mondaySync";

// Monday's global endpoint. Overridable because Monday runs regional endpoints
// for data residency (an EU account is not on this host), and because it lets
// the sync be exercised against a stand-in API without a live board.
const ENDPOINT = process.env.MONDAY_API_URL?.trim() || "https://api.monday.com/v2";

const KEY = {
  enabled: "monday.enabled",
  apiToken: "monday.apiToken",
  boardId: "monday.boardId",
  apiVersion: "monday.apiVersion",
  nameColumn: "monday.nameColumn",
  positionColumn: "monday.positionColumn",
  shiftColumn: "monday.shiftColumn",
  employeeNumberColumn: "monday.employeeNumberColumn",
  misc1Column: "monday.misc1Column",
  misc2Column: "monday.misc2Column",
  terminateMissing: "monday.terminateMissing",
  syncMinutes: "monday.syncMinutes",
} as const;

// Monday dates its API versions and retires them; this is the default, and it
// is editable in Settings so a retirement does not need a code change.
export const DEFAULT_API_VERSION = "2024-10";
// A board page. Monday caps a page at 500; 100 keeps each query's complexity
// well inside the budget.
const PAGE_SIZE = 100;
// Stop rather than loop forever if a cursor never clears — 200 pages is 20,000
// rows, far past any plausible warehouse roster.
const MAX_PAGES = 200;

const DEFAULT_SYNC_MINUTES = 60;
const MIN_SYNC_MINUTES = 5;
const MAX_SYNC_MINUTES = 24 * 60;

export const clampSyncMinutes = (v: unknown): number => {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_SYNC_MINUTES;
  return Math.min(MAX_SYNC_MINUTES, Math.max(MIN_SYNC_MINUTES, n));
};

export type MondayConfig = {
  enabled: boolean;
  boardId: string;
  apiVersion: string;
  nameColumn: string;
  positionColumn: string;
  shiftColumn: string;
  employeeNumberColumn: string;
  misc1Column: string;
  misc2Column: string;
  terminateMissing: boolean;
  syncMinutes: number;
};
type MondayConfigFull = MondayConfig & { apiToken: string };

async function readAll(): Promise<Record<string, string>> {
  const locationId = await getActiveLocationId();
  if (!locationId) return {};
  const rows = await prisma.locationSetting.findMany({
    where: { locationId, key: { in: Object.values(KEY) } },
  });
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

async function fullConfig(): Promise<MondayConfigFull> {
  const m = await readAll();
  return {
    enabled: m[KEY.enabled] === "true",
    apiToken: m[KEY.apiToken] ?? "",
    boardId: (m[KEY.boardId] ?? "").trim(),
    apiVersion: (m[KEY.apiVersion] ?? "").trim() || DEFAULT_API_VERSION,
    nameColumn: m[KEY.nameColumn] ?? "",
    positionColumn: m[KEY.positionColumn] ?? "",
    shiftColumn: m[KEY.shiftColumn] ?? "",
    employeeNumberColumn: m[KEY.employeeNumberColumn] ?? "",
    misc1Column: m[KEY.misc1Column] ?? "",
    misc2Column: m[KEY.misc2Column] ?? "",
    // Terminating people is the one thing here that removes someone from the
    // board, so it is opt-in rather than assumed.
    terminateMissing: m[KEY.terminateMissing] === "true",
    syncMinutes: clampSyncMinutes(m[KEY.syncMinutes]),
  };
}

// The token is never returned — only whether one is stored, like Opendock.
export async function getMondayConfig(): Promise<
  MondayConfig & { hasApiToken: boolean }
> {
  const c = await fullConfig();
  const { apiToken, ...rest } = c;
  return { ...rest, hasApiToken: !!apiToken };
}

export async function setMondayConfig(input: Partial<MondayConfigFull>): Promise<void> {
  const locationId = await getActiveLocationId();
  if (!locationId) return;
  const write = async (key: string, value: string) => {
    await prisma.locationSetting.upsert({
      where: { locationId_key: { locationId, key } },
      update: { value },
      create: { locationId, key, value },
    });
  };
  if (input.enabled !== undefined) await write(KEY.enabled, input.enabled ? "true" : "false");
  // A blank token means "leave the stored one alone", so editing the board id
  // does not wipe the secret.
  if (input.apiToken) await write(KEY.apiToken, input.apiToken);
  if (input.boardId !== undefined) await write(KEY.boardId, input.boardId.trim());
  if (input.apiVersion !== undefined) await write(KEY.apiVersion, input.apiVersion.trim());
  if (input.nameColumn !== undefined) await write(KEY.nameColumn, input.nameColumn.trim());
  if (input.positionColumn !== undefined) await write(KEY.positionColumn, input.positionColumn.trim());
  if (input.shiftColumn !== undefined) await write(KEY.shiftColumn, input.shiftColumn.trim());
  if (input.employeeNumberColumn !== undefined)
    await write(KEY.employeeNumberColumn, input.employeeNumberColumn.trim());
  if (input.misc1Column !== undefined) await write(KEY.misc1Column, input.misc1Column.trim());
  if (input.misc2Column !== undefined) await write(KEY.misc2Column, input.misc2Column.trim());
  if (input.terminateMissing !== undefined)
    await write(KEY.terminateMissing, input.terminateMissing ? "true" : "false");
  if (input.syncMinutes !== undefined)
    await write(KEY.syncMinutes, String(clampSyncMinutes(input.syncMinutes)));
}

// ---- API client -----------------------------------------------------------

export type GraphQLResult = {
  status: number;
  body: unknown;
  // Monday answers 200 with an `errors` array for query problems, so a status
  // check alone is not enough to know a call worked.
  errors: string[];
};

async function graphql(
  cfg: { apiToken: string; apiVersion: string },
  query: string,
  variables?: Record<string, unknown>
): Promise<GraphQLResult> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      // Monday takes the raw token in Authorization, with no Bearer prefix.
      Authorization: cfg.apiToken,
      "Content-Type": "application/json",
      "API-Version": cfg.apiVersion,
    },
    body: JSON.stringify({ query, variables }),
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const raw = Array.isArray(b.errors) ? b.errors : [];
  const errors = raw.map((e) =>
    typeof e === "string" ? e : String((e as { message?: unknown })?.message ?? JSON.stringify(e))
  );
  // Some versions report auth failures in error_message rather than errors.
  if (typeof b.error_message === "string") errors.push(b.error_message);
  return { status: res.status, body, errors };
}

export type BoardColumn = { id: string; title: string; type: string };
export type BoardRow = {
  itemId: string;
  name: string;
  // Column id → its text rendering. Monday gives a `text` field that is the
  // human-readable value for every column type, which is what we map from.
  cells: Record<string, string>;
};

const ITEMS_QUERY = `
  query Roster($boardId: ID!, $limit: Int!, $cursor: String) {
    boards(ids: [$boardId]) {
      id
      name
      columns { id title type }
      items_page(limit: $limit, cursor: $cursor) {
        cursor
        items {
          id
          name
          column_values { id text }
        }
      }
    }
  }
`;

function parsePage(body: unknown): {
  boardName: string | null;
  columns: BoardColumn[];
  rows: BoardRow[];
  cursor: string | null;
} {
  const data = ((body as { data?: unknown })?.data ?? {}) as Record<string, unknown>;
  const boards = Array.isArray(data.boards) ? data.boards : [];
  const board = (boards[0] ?? {}) as Record<string, unknown>;
  const page = (board.items_page ?? {}) as Record<string, unknown>;
  const items = Array.isArray(page.items) ? page.items : [];
  const columns = (Array.isArray(board.columns) ? board.columns : []).map((c) => {
    const col = c as Record<string, unknown>;
    return {
      id: String(col.id ?? ""),
      title: String(col.title ?? ""),
      type: String(col.type ?? ""),
    };
  });
  const rows: BoardRow[] = items.map((i) => {
    const item = i as Record<string, unknown>;
    const values = Array.isArray(item.column_values) ? item.column_values : [];
    const cells: Record<string, string> = {};
    for (const v of values) {
      const cv = v as Record<string, unknown>;
      cells[String(cv.id ?? "")] = String(cv.text ?? "").trim();
    }
    return {
      itemId: String(item.id ?? ""),
      name: String(item.name ?? "").trim(),
      cells,
    };
  });
  return {
    boardName: board.name ? String(board.name) : null,
    columns,
    rows,
    cursor: page.cursor ? String(page.cursor) : null,
  };
}

// Every row on the board, following the cursor. Throws with a readable message
// rather than returning a half-read board: a partial read must never look like
// "these people are gone".
export async function fetchBoard(cfg: MondayConfigFull): Promise<{
  boardName: string | null;
  columns: BoardColumn[];
  rows: BoardRow[];
}> {
  if (!cfg.apiToken) throw new Error("No Monday API token is saved.");
  if (!cfg.boardId) throw new Error("No Monday board ID is set.");

  const rows: BoardRow[] = [];
  let cursor: string | null = null;
  let boardName: string | null = null;
  let columns: BoardColumn[] = [];

  for (let page = 0; page < MAX_PAGES; page++) {
    const r: GraphQLResult = await graphql(cfg, ITEMS_QUERY, {
      boardId: cfg.boardId,
      limit: PAGE_SIZE,
      cursor,
    });
    if (r.status === 401 || r.status === 403) {
      throw new Error("Monday rejected the API token (check it in Settings).");
    }
    if (r.errors.length) throw new Error(`Monday API: ${r.errors.join("; ")}`);
    if (r.status >= 400) throw new Error(`Monday API returned HTTP ${r.status}.`);

    const parsed = parsePage(r.body);
    if (page === 0) {
      boardName = parsed.boardName;
      columns = parsed.columns;
      if (!boardName && parsed.rows.length === 0) {
        throw new Error(
          "Monday returned no board for that ID — check the board ID, and that the token's account can see it."
        );
      }
    }
    rows.push(...parsed.rows);
    cursor = parsed.cursor;
    if (!cursor || parsed.rows.length === 0) break;
  }

  return { boardName, columns, rows };
}

// ---- Sync -----------------------------------------------------------------

const LAST_SYNC_KEY = (locationId: string) => `mondayLastSync:${locationId}`;

export type SyncResult = {
  ok: boolean;
  message: string;
  created: number;
  updated: number;
  terminated: number;
  plan?: SyncPlan;
  // Positions named on the board that do not exist here. Deliberately not
  // created — the same rule the spreadsheet import follows, so one typo on a
  // board cannot add a column to everyone's dashboard.
  unknownPositions?: string[];
};

// Build the plan for the current board without writing anything.
export async function previewSync(): Promise<{
  plan: SyncPlan;
  people: MappedPerson[];
  boardName: string | null;
  unknownPositions: string[];
  positionIdFor: (title: string | null) => string | null;
}> {
  const cfg = await fullConfig();
  const { rows, boardName } = await fetchBoard(cfg);
  const people = rows
    .map((r) => mapRow(r, cfg))
    .filter((p): p is MappedPerson => p !== null);

  const existing = await prisma.employee.findMany({
    select: {
      id: true,
      name: true,
      mondayItemId: true,
      accessLevel: true,
      terminatedAt: true,
      positionId: true,
      shift: true,
      employeeNumber: true,
      misc1: true,
      misc2: true,
    },
  });

  const positions = await prisma.position.findMany({ select: { id: true, title: true } });
  const fold = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const positionIdFor = (title: string | null): string | null =>
    title ? (positions.find((p) => fold(p.title) === fold(title))?.id ?? null) : null;

  const plan = planSync(people, existing, {
    terminateMissing: cfg.terminateMissing,
    rowCount: rows.length,
    positionIdFor,
  });

  const titles = [...new Set(people.map((p) => p.positionTitle).filter(Boolean))] as string[];
  const unknownPositions = titles.filter((t) => positionIdFor(t) === null);

  return { plan, people, boardName, unknownPositions, positionIdFor };
}

// Run a sync. Safe to call repeatedly: it is driven by the plan, so a second
// run with an unchanged board changes nothing.
export async function runSync(): Promise<SyncResult> {
  const cfg = await fullConfig();
  if (!cfg.enabled) {
    return { ok: false, message: "The Monday sync is turned off.", created: 0, updated: 0, terminated: 0 };
  }

  // Positions are matched, never created — a board typo must not reshape the
  // board everyone looks at. previewSync resolves them the same way.
  const { plan, unknownPositions, positionIdFor } = await previewSync();

  const fields = (p: MappedPerson) => ({
    name: p.name,
    positionId: positionIdFor(p.positionTitle),
    shift: p.shift,
    employeeNumber: p.employeeNumber,
    misc1: p.misc1,
    misc2: p.misc2,
  });

  let created = 0;
  for (const p of plan.create) {
    await prisma.employee.create({
      data: { ...fields(p), mondayItemId: p.itemId },
    });
    created++;
  }

  let updated = 0;
  for (const { id, person } of plan.update) {
    await prisma.employee.update({
      where: { id },
      // Someone whose row reappears is a rehire, so bring them back rather
      // than leaving a terminated person being updated every sync.
      data: { ...fields(person), terminatedAt: null },
    });
    updated++;
  }

  let terminated = 0;
  for (const t of plan.terminate) {
    // Matches what the Terminate button does, so Reactivate behaves the same
    // way for someone the sync removed as for someone a human removed.
    await prisma.employee.update({
      where: { id: t.id },
      data: { terminatedAt: new Date(), accessLevel: "NONE", positionId: null, isLead: false },
    });
    await prisma.activityLog.updateMany({
      where: { subjectId: t.id },
      data: { archived: true },
    });
    terminated++;
  }

  const message = describePlan(plan);
  if (created || updated || terminated) {
    await logActivity("Integration", `Monday board sync: ${message}`);
  }

  const locationId = await getActiveLocationId();
  if (locationId) {
    await prisma.setting.upsert({
      where: { key: LAST_SYNC_KEY(locationId) },
      update: { value: new Date().toISOString() },
      create: { key: LAST_SYNC_KEY(locationId), value: new Date().toISOString() },
    });
  }

  return { ok: true, message, created, updated, terminated, plan, unknownPositions };
}

// Run a sync only if one is due, swallowing every error. Called from the admin
// roster fetch, so a Monday outage can never stop the Employees page loading.
export async function syncIfDue(now = new Date()): Promise<void> {
  try {
    const cfg = await fullConfig();
    if (!cfg.enabled || !cfg.apiToken || !cfg.boardId) return;
    const locationId = await getActiveLocationId();
    if (!locationId) return;

    const key = LAST_SYNC_KEY(locationId);
    const last = await prisma.setting.findUnique({ where: { key } });
    const lastAt = last?.value ? Date.parse(last.value) : 0;
    if (Number.isFinite(lastAt) && now.getTime() - lastAt < cfg.syncMinutes * 60_000) return;

    // Claim the slot before the work, so two overlapping requests don't both
    // sync the same board.
    await prisma.setting.upsert({
      where: { key },
      update: { value: now.toISOString() },
      create: { key, value: now.toISOString() },
    });
    await runSync();
  } catch {
    // Deliberately silent: the Employees page must load regardless.
  }
}

export async function getLastSyncAt(): Promise<string | null> {
  const locationId = await getActiveLocationId();
  if (!locationId) return null;
  const row = await prisma.setting.findUnique({ where: { key: LAST_SYNC_KEY(locationId) } });
  return row?.value ?? null;
}

// ---- Test connection ------------------------------------------------------

export type MondayDiagnostic = {
  endpoint: string;
  apiVersion: string;
  boardId: string;
  status: number | string;
  errors: string[];
  boardName: string | null;
  columns: BoardColumn[];
  rowCount: number;
  // First few rows, so the admin can see the sync reading real names.
  sample: { itemId: string; name: string; cells: Record<string, string> }[];
  mappedPreview: MappedPerson[];
  unknownPositions: string[];
  plan: { create: number; update: number; terminate: number; held: string | null } | null;
};

export async function diagnoseMonday(): Promise<MondayDiagnostic> {
  const cfg = await fullConfig();
  const base: MondayDiagnostic = {
    endpoint: ENDPOINT,
    apiVersion: cfg.apiVersion,
    boardId: cfg.boardId,
    status: "not attempted",
    errors: [],
    boardName: null,
    columns: [],
    rowCount: 0,
    sample: [],
    mappedPreview: [],
    unknownPositions: [],
    plan: null,
  };
  if (!cfg.apiToken) return { ...base, errors: ["No API token saved."] };
  if (!cfg.boardId) return { ...base, errors: ["No board ID set."] };

  const probe = await graphql(cfg, ITEMS_QUERY, {
    boardId: cfg.boardId,
    limit: 10,
    cursor: null,
  });
  const parsed = parsePage(probe.body);
  const mapped = parsed.rows
    .map((r) => mapRow(r, cfg))
    .filter((p): p is MappedPerson => p !== null);

  const out: MondayDiagnostic = {
    ...base,
    status: probe.status,
    errors: probe.errors,
    boardName: parsed.boardName,
    columns: parsed.columns,
    rowCount: parsed.rows.length,
    sample: parsed.rows.slice(0, 5),
    mappedPreview: mapped.slice(0, 5),
  };
  if (probe.errors.length || probe.status >= 400) return out;

  // A full dry run, so the admin sees what a sync would actually do before
  // letting one happen.
  try {
    const preview = await previewSync();
    out.unknownPositions = preview.unknownPositions;
    out.plan = {
      create: preview.plan.create.length,
      update: preview.plan.update.length,
      terminate: preview.plan.terminate.length,
      held: preview.plan.terminationsHeld
        ? `${preview.plan.terminationsHeld.count} held: ${preview.plan.terminationsHeld.reason}`
        : null,
    };
  } catch {
    // The probe already told us what we needed; a failed dry run is not fatal.
  }
  return out;
}
