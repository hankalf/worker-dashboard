import { appMinutes, easternDateKey, easternInputToUtcISO } from "@/lib/time";

export type ShiftKey = "FIRST" | "SECOND" | "THIRD";

// Shift boundaries as minute-of-day (Eastern). The three starts partition the
// 24h day in order (first < second < third); each shift ends where the next
// begins, and THIRD wraps past midnight back to FIRST's start.
export type ShiftBounds = {
  firstStart: number;
  secondStart: number;
  thirdStart: number;
};

// Default: 1st 6am–2pm, 2nd 2pm–10pm, 3rd 10pm–6am.
export const DEFAULT_SHIFT_BOUNDS: ShiftBounds = {
  firstStart: 6 * 60,
  secondStart: 14 * 60,
  thirdStart: 22 * 60,
};

const startMin = (shift: ShiftKey, b: ShiftBounds) =>
  shift === "FIRST"
    ? b.firstStart
    : shift === "SECOND"
      ? b.secondStart
      : b.thirdStart;

// Each shift ends where the next one starts (THIRD wraps to FIRST's start).
const endMin = (shift: ShiftKey, b: ShiftBounds) =>
  shift === "FIRST"
    ? b.secondStart
    : shift === "SECOND"
      ? b.thirdStart
      : b.firstStart;

const hhmm = (min: number) => {
  const hh = String(Math.floor(min / 60) % 24).padStart(2, "0");
  const mm = String(min % 60).padStart(2, "0");
  return `${hh}:${mm}`;
};

// "6:00 AM" from a minute-of-day.
const clock12 = (min: number) => {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

// The end of a shift's current instance as an absolute Date. 3rd shift ends at
// 1st shift's start; once it's past that time Eastern the relevant end rolls to
// the next day.
export function shiftEndDate(
  shift: ShiftKey,
  now: Date,
  bounds: ShiftBounds = DEFAULT_SHIFT_BOUNDS
): Date {
  let dateKey = easternDateKey(now);
  // 3rd shift's end (1st start) falls on the next day only while we're in its
  // pre-midnight part (at/after 3rd starts); after midnight it's today's.
  if (shift === "THIRD" && appMinutes(now) >= bounds.thirdStart) {
    dateKey = easternDateKey(new Date(now.getTime() + 24 * 3600 * 1000));
  }
  return new Date(easternInputToUtcISO(`${dateKey}T${hhmm(endMin(shift, bounds))}`));
}

// The NEXT time a shift starts at/after `now` (today if it hasn't started yet,
// otherwise tomorrow). Used as the visibility window for "coming in early".
export function shiftStartDate(
  shift: ShiftKey,
  now: Date,
  bounds: ShiftBounds = DEFAULT_SHIFT_BOUNDS
): Date {
  const min = startMin(shift, bounds);
  let dateKey = easternDateKey(now);
  if (appMinutes(now) >= min) {
    dateKey = easternDateKey(new Date(now.getTime() + 24 * 3600 * 1000));
  }
  return new Date(easternInputToUtcISO(`${dateKey}T${hhmm(min)}`));
}

export const SHIFT_LABEL: Record<ShiftKey, string> = {
  FIRST: "1st Shift",
  SECOND: "2nd Shift",
  THIRD: "3rd Shift",
};

// A shift's window as minute-of-day plus its length. THIRD wraps past midnight,
// so `start + length` can exceed 1440 — callers should take hours modulo 24.
export function shiftWindow(
  shift: ShiftKey,
  bounds: ShiftBounds = DEFAULT_SHIFT_BOUNDS
): { start: number; length: number } {
  const start = startMin(shift, bounds);
  const end = endMin(shift, bounds);
  const length = end > start ? end - start : end + 24 * 60 - start;
  return { start, length };
}

// The displayed time range for a shift, e.g. "6:00 AM – 2:00 PM".
export function shiftRange(
  shift: ShiftKey,
  bounds: ShiftBounds = DEFAULT_SHIFT_BOUNDS
): string {
  return `${clock12(startMin(shift, bounds))} – ${clock12(endMin(shift, bounds))}`;
}

// Backward-compatible label + default-range map. Prefer shiftRange(key, bounds)
// where the admin-configured times should be reflected.
export const SHIFTS: Record<ShiftKey, { label: string; range: string }> = {
  FIRST: { label: SHIFT_LABEL.FIRST, range: shiftRange("FIRST") },
  SECOND: { label: SHIFT_LABEL.SECOND, range: shiftRange("SECOND") },
  THIRD: { label: SHIFT_LABEL.THIRD, range: shiftRange("THIRD") },
};

// Which shift is active at `now`, evaluated in the warehouse's timezone against
// the configured boundaries. Safe on server and client.
export const currentShift = (
  now: Date,
  bounds: ShiftBounds = DEFAULT_SHIFT_BOUNDS
): ShiftKey => {
  const cur = appMinutes(now);
  if (cur >= bounds.firstStart && cur < bounds.secondStart) return "FIRST";
  if (cur >= bounds.secondStart && cur < bounds.thirdStart) return "SECOND";
  return "THIRD";
};
