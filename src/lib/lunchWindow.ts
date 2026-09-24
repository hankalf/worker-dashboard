// When lunches may be taken, as a per-shift time frame.
//
// A window is a promise about the floor: "1st shift lunches are 11:30–12:15"
// means everyone is back by 12:15, so the whole 30-minute lunch has to fit
// inside it — a lunch starting at 12:00 ends at 12:30 and breaks that promise.
// Auto-stagger therefore places lunches from the window's opening at the usual
// 30-minute spacing, and anything that cannot finish in time still gets a time
// (nobody is left unfed) but is flagged on the Lunches tab.
//
// No window configured for a shift = the old behaviour: lunches are centred in
// the shift automatically.

import { LUNCH_MINUTES, toMinutes } from "@/lib/lunchCapacity";
import type { ShiftKey } from "@/lib/shift";

export type LunchWindow = {
  // Minute-of-day, 0..1439.
  start: number;
  end: number;
};

export type LunchWindows = Partial<Record<ShiftKey, LunchWindow>>;

export const SHIFT_KEYS: ShiftKey[] = ["FIRST", "SECOND", "THIRD"];

// A window has to hold at least one whole lunch to mean anything; a 20-minute
// window for a 30-minute lunch could never be satisfied by any schedule.
export const MIN_WINDOW_MINUTES = LUNCH_MINUTES;

// The span of start times that let a lunch finish inside the window. `latest`
// is the last minute a lunch may begin.
export function usableSpan(w: LunchWindow): { earliest: number; latest: number } {
  return { earliest: w.start, latest: w.end - LUNCH_MINUTES };
}

// Does a lunch beginning at `startMin` finish inside the window?
//
// `startMin` and the window are both minute-of-day, and a 3rd-shift window sits
// after midnight while the shift began the evening before. Comparing raw
// minute-of-day would call a 01:00 lunch "before" a window opening at 00:30 of
// the same night only if we ignore that both are on the far side of midnight —
// they are not, so a plain comparison is right for any window that does not
// itself wrap. A window that wraps midnight (23:30–00:30) is rejected when
// saved, so it cannot reach here.
export function fitsInWindow(startMin: number, w: LunchWindow): boolean {
  const { earliest, latest } = usableSpan(w);
  return startMin >= earliest && startMin <= latest;
}

// The window for a shift, or null when none is set (auto-placement).
export const windowFor = (
  shift: string | null | undefined,
  windows: LunchWindows
): LunchWindow | null =>
  shift && (SHIFT_KEYS as string[]).includes(shift)
    ? (windows[shift as ShiftKey] ?? null)
    : null;

// Is this scheduled lunch outside its shift's window? False when the shift has
// no window, when there is no lunch, or when the lunch fits.
export function outsideWindow(
  lunchStart: string | null | undefined,
  shift: string | null | undefined,
  windows: LunchWindows
): boolean {
  if (!lunchStart) return false;
  const w = windowFor(shift, windows);
  if (!w) return false;
  return !fitsInWindow(toMinutes(lunchStart), w);
}

// "11:30" from a minute-of-day.
export const toHhmm = (min: number): string => {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

// "11:30 AM" from a minute-of-day, for messages people read.
export const toClock = (min: number): string => {
  const m = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m % 60).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

export type WindowProblem = "malformed" | "backwards" | "tooShort" | null;

// Validate a start/end pair. Returns the reason it cannot be used, or null when
// it is fine. Both blank is not a problem — that clears the window.
export function windowProblem(
  start: number | null,
  end: number | null
): WindowProblem {
  if (start === null || end === null) return "malformed";
  // Equal or backwards would also catch a window someone tried to wrap past
  // midnight (23:30–00:30), which we do not support: a wrapping window makes
  // "before the window" ambiguous for every comparison downstream.
  if (end <= start) return "backwards";
  if (end - start < MIN_WINDOW_MINUTES) return "tooShort";
  return null;
}

export const WINDOW_PROBLEM_MESSAGE: Record<
  Exclude<WindowProblem, null>,
  string
> = {
  malformed: "Lunch window times must be valid times (HH:MM).",
  backwards:
    "A lunch window must end after it starts, and cannot run past midnight.",
  tooShort: `A lunch window must be at least ${MIN_WINDOW_MINUTES} minutes — a ${LUNCH_MINUTES}-minute lunch has to fit inside it.`,
};
