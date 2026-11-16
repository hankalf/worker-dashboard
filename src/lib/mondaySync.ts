// Working out what a Monday board sync would change, separately from doing it.
//
// Kept pure and away from the API client on purpose: this is the part that can
// terminate people, so it has to be testable without a board, and the guard
// rails below have to be provable rather than hoped for.

import type { BoardRow } from "@/lib/monday";

export type ShiftKey = "FIRST" | "SECOND" | "THIRD";

// Same spellings the CSV import accepts, so a board and a spreadsheet agree.
const SHIFT_MAP: Record<string, ShiftKey> = {
  "1": "FIRST", "1st": "FIRST", first: "FIRST", "first shift": "FIRST",
  "2": "SECOND", "2nd": "SECOND", second: "SECOND", "second shift": "SECOND",
  "3": "THIRD", "3rd": "THIRD", third: "THIRD", "third shift": "THIRD",
};

export const parseShift = (v: string | undefined): ShiftKey | null =>
  SHIFT_MAP[(v ?? "").trim().toLowerCase()] ?? null;

export type ColumnMap = {
  nameColumn: string;
  positionColumn: string;
  shiftColumn: string;
  employeeNumberColumn: string;
  misc1Column: string;
  misc2Column: string;
};

// What one board row says a person should look like.
export type MappedPerson = {
  itemId: string;
  name: string;
  positionTitle: string | null;
  shift: ShiftKey | null;
  employeeNumber: string | null;
  misc1: string | null;
  misc2: string | null;
};

const cell = (row: BoardRow, columnId: string): string | null => {
  if (!columnId) return null;
  const v = (row.cells[columnId] ?? "").trim();
  return v || null;
};

// A row becomes a person only if it yields a name. Blank rows and group
// headers exist on most boards and must not become nameless employees.
export function mapRow(row: BoardRow, map: ColumnMap): MappedPerson | null {
  const name = (map.nameColumn ? cell(row, map.nameColumn) : row.name)?.trim();
  if (!name || !row.itemId) return null;
  return {
    itemId: row.itemId,
    name,
    positionTitle: cell(row, map.positionColumn),
    shift: parseShift(cell(row, map.shiftColumn) ?? undefined),
    employeeNumber: cell(row, map.employeeNumberColumn),
    misc1: cell(row, map.misc1Column),
    misc2: cell(row, map.misc2Column),
  };
}

// The employees the sync is allowed to reason about.
export type ExistingEmployee = {
  id: string;
  name: string;
  mondayItemId: string | null;
  accessLevel: string;
  terminatedAt: Date | string | null;
  // Current values of the synced fields, so a row whose values already match
  // is left out of the plan entirely. Without this every sync would "update"
  // everybody, filling the activity log with no-ops and making the update
  // count meaningless.
  positionId?: string | null;
  shift?: string | null;
  employeeNumber?: string | null;
  misc1?: string | null;
  misc2?: string | null;
};

export type SyncPlan = {
  create: MappedPerson[];
  update: { id: string; person: MappedPerson }[];
  // Linked employees whose row has gone from the board.
  terminate: { id: string; name: string }[];
  // Linked rows whose values already match — counted, never written.
  unchanged: number;
  // Gone from the board but deliberately left alone, with the reason.
  protected: { id: string; name: string; reason: string }[];
  // Rows that could not become a person, and anything else worth saying.
  warnings: string[];
  // Set when terminations were worked out but withheld: something looked wrong
  // enough that acting on it would be the bigger risk.
  terminationsHeld: { count: number; reason: string } | null;
};

export type PlanOptions = {
  terminateMissing: boolean;
  // Maps a position title from the board to an id here, or null when no such
  // position exists. Injected so the planner stays pure and testable.
  positionIdFor?: (title: string | null) => string | null;
  // Rows the board returned. An empty board with linked employees is the
  // signature of a misconfiguration or a bad response, not of everyone
  // leaving, so terminations are withheld.
  rowCount: number;
  // Withhold terminations when they would take out more than this share of the
  // linked roster. A board id typo reads as "everyone left"; a real week of
  // leavers does not.
  maxTerminationShare?: number;
};

const DEFAULT_MAX_TERMINATION_SHARE = 0.5;

export function planSync(
  people: MappedPerson[],
  existing: ExistingEmployee[],
  opts: PlanOptions
): SyncPlan {
  const warnings: string[] = [];

  // Two rows pointing at the same person would fight each other on every sync;
  // keep the first and say so.
  const seen = new Set<string>();
  const unique: MappedPerson[] = [];
  for (const p of people) {
    if (seen.has(p.itemId)) {
      warnings.push(`Board row ${p.itemId} appeared twice — the later one was ignored.`);
      continue;
    }
    seen.add(p.itemId);
    unique.push(p);
  }

  const byItemId = new Map(
    existing.filter((e) => e.mondayItemId).map((e) => [e.mondayItemId!, e])
  );

  const resolve = opts.positionIdFor ?? (() => null);
  // Null and "" mean the same thing on a roster field; treat them as equal so a
  // blank board cell does not read as a change every time.
  const same = (a: unknown, b: unknown) => (a ?? null) === (b ?? null);
  const matches = (e: ExistingEmployee, p: MappedPerson) =>
    e.name === p.name &&
    same(e.positionId, resolve(p.positionTitle)) &&
    same(e.shift, p.shift) &&
    same(e.employeeNumber, p.employeeNumber) &&
    same(e.misc1, p.misc1) &&
    same(e.misc2, p.misc2);

  const create: MappedPerson[] = [];
  const update: { id: string; person: MappedPerson }[] = [];
  let unchanged = 0;
  for (const p of unique) {
    const match = byItemId.get(p.itemId);
    if (!match) {
      create.push(p);
      continue;
    }
    // A terminated person reappearing on the board is a rehire: update them so
    // the plan carries the change, and let the executor bring them back.
    if (matches(match, p) && !match.terminatedAt) {
      unchanged++;
      continue;
    }
    update.push({ id: match.id, person: p });
  }

  // Only ever consider employees this board put here. Anyone added by hand has
  // no link and is never touched, however the board changes.
  const linked = existing.filter((e) => e.mondayItemId && !e.terminatedAt);
  const missing = linked.filter((e) => !seen.has(e.mondayItemId!));

  const terminate: { id: string; name: string }[] = [];
  const protectedRows: { id: string; name: string; reason: string }[] = [];
  for (const e of missing) {
    // A login account disappearing from a board should not silently cost
    // someone their access; report it and let a human decide.
    if (e.accessLevel !== "NONE") {
      protectedRows.push({
        id: e.id,
        name: e.name,
        reason: `has ${e.accessLevel} panel access — terminate by hand if that is right`,
      });
      continue;
    }
    terminate.push({ id: e.id, name: e.name });
  }

  let terminationsHeld: SyncPlan["terminationsHeld"] = null;
  if (!opts.terminateMissing) {
    if (terminate.length) {
      terminationsHeld = {
        count: terminate.length,
        reason: "terminating people removed from the board is turned off",
      };
    }
    terminate.length = 0;
  } else if (terminate.length) {
    const share = opts.maxTerminationShare ?? DEFAULT_MAX_TERMINATION_SHARE;
    if (opts.rowCount === 0) {
      terminationsHeld = {
        count: terminate.length,
        reason:
          "the board came back empty — that reads as a wrong board ID or a bad response, not as everyone leaving",
      };
      terminate.length = 0;
    } else if (linked.length > 0 && terminate.length / linked.length > share) {
      terminationsHeld = {
        count: terminate.length,
        reason: `that is over ${Math.round(share * 100)}% of the synced roster — check the board before letting this through`,
      };
      terminate.length = 0;
    }
  }

  return { create, update, terminate, unchanged, protected: protectedRows, warnings, terminationsHeld };
}

// A plain-language summary of what a sync did (or would do).
export function describePlan(plan: SyncPlan): string {
  const bits: string[] = [];
  if (plan.create.length) bits.push(`${plan.create.length} added`);
  if (plan.update.length) bits.push(`${plan.update.length} updated`);
  if (plan.terminate.length) bits.push(`${plan.terminate.length} terminated`);
  if (!bits.length) {
    bits.push(plan.unchanged ? `nothing to change (${plan.unchanged} already in step)` : "nothing to change");
  }
  let out = bits.join(", ");
  if (plan.terminationsHeld) {
    out += ` — ${plan.terminationsHeld.count} termination(s) held back: ${plan.terminationsHeld.reason}`;
  }
  if (plan.protected.length) out += ` — ${plan.protected.length} left alone`;
  return out;
}
