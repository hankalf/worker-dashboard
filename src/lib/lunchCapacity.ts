// How many people from one position may be at lunch at the same time.
//
// Two places need this and they must agree: the auto-stagger lays lunches out
// so the limit holds, and the Lunches tab flags it when a hand edit breaks it.
// Keeping the rule here means a change lands in both.

// Lunch is a fixed 30 minutes everywhere in the app (the board, the Lunches
// tab's "back at", the stagger).
export const LUNCH_MINUTES = 30;

// Employees with no position share one bucket. They are not a real position, so
// they get the default of one-at-a-time rather than an unlimited pass.
export const NO_POSITION = "__none__";
export const DEFAULT_LUNCH_CAPACITY = 1;

export const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

// A capacity that is always usable: at least 1, so a position can never be
// configured into a state where nobody is allowed to eat.
export const cleanCapacity = (v: unknown): number =>
  Math.max(1, Math.min(99, Math.floor(Number(v)) || DEFAULT_LUNCH_CAPACITY));

// Who is grouped with whom. Position AND shift: two people on the same position
// but different shifts are never on the floor together, so one at 12:00 on 1st
// and another at 12:00 on 3rd is not a clash.
export const lunchGroupKey = (
  positionId: string | null | undefined,
  shift: string | null | undefined
): string => `${positionId ?? NO_POSITION}::${shift ?? "none"}`;

export type LunchRow = {
  id: string;
  lunchStart: string | null;
  positionId: string | null;
  shift: string | null;
};

export type LunchConflict = {
  // How many from this group are out at the same moment as this person,
  // counting them. 1 means they are alone.
  concurrent: number;
  capacity: number;
  // concurrent > capacity: more of this position are out than is allowed.
  over: boolean;
};

// For each scheduled lunch, how many of the same position+shift overlap it.
// Overlap is half-open ([start, start+30)), so a lunch ending exactly as
// another begins is a clean handover, not a clash.
export function lunchConflicts(
  rows: LunchRow[],
  capacityFor: (positionId: string | null) => number
): Map<string, LunchConflict> {
  const scheduled = rows.filter((r) => r.lunchStart);
  const groups = new Map<string, LunchRow[]>();
  for (const r of scheduled) {
    const key = lunchGroupKey(r.positionId, r.shift);
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }

  const out = new Map<string, LunchConflict>();
  for (const members of groups.values()) {
    for (const r of members) {
      const start = toMinutes(r.lunchStart!);
      const end = start + LUNCH_MINUTES;
      const concurrent = members.filter((o) => {
        const s = toMinutes(o.lunchStart!);
        return s < end && s + LUNCH_MINUTES > start;
      }).length;
      const capacity = capacityFor(r.positionId);
      out.set(r.id, { concurrent, capacity, over: concurrent > capacity });
    }
  }
  return out;
}

// How many distinct lunch slots a crew of `size` needs when `capacity` of them
// may be out together — ceil(size / capacity), never less than one slot.
export const slotsNeeded = (size: number, capacity: number): number =>
  Math.max(1, Math.ceil(size / Math.max(1, capacity)));
