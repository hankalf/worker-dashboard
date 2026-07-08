import { appMinutes, easternDateKey, easternInputToUtcISO } from "@/lib/time";

export type ShiftKey = "FIRST" | "SECOND" | "THIRD";

// Minute-of-day (Eastern) each shift ends: 1st 2pm, 2nd 10pm, 3rd 6am.
const SHIFT_END_MIN: Record<ShiftKey, number> = {
  FIRST: 14 * 60,
  SECOND: 22 * 60,
  THIRD: 6 * 60,
};

// The end of a shift's current instance as an absolute Date. 3rd shift ends at
// 6am; once it's past 6am Eastern the relevant end rolls to the next day.
export function shiftEndDate(shift: ShiftKey, now: Date): Date {
  const endMin = SHIFT_END_MIN[shift];
  const hh = String(Math.floor(endMin / 60)).padStart(2, "0");
  const mm = String(endMin % 60).padStart(2, "0");
  let dateKey = easternDateKey(now);
  // 3rd shift runs 10pm–6am. Only when we're in its pre-midnight part (>=10pm)
  // does its 6am end fall on the next day; otherwise (incl. just after 6am) the
  // relevant end is today's 6am.
  if (shift === "THIRD" && appMinutes(now) >= 22 * 60) {
    dateKey = easternDateKey(new Date(now.getTime() + 24 * 3600 * 1000));
  }
  return new Date(easternInputToUtcISO(`${dateKey}T${hh}:${mm}`));
}

// Minute-of-day (Eastern) each shift starts: 1st 6am, 2nd 2pm, 3rd 10pm.
const SHIFT_START_MIN: Record<ShiftKey, number> = {
  FIRST: 6 * 60,
  SECOND: 14 * 60,
  THIRD: 22 * 60,
};

// The NEXT time a shift starts at/after `now` (today if it hasn't started yet,
// otherwise tomorrow). Used as the visibility window for "coming in early".
export function shiftStartDate(shift: ShiftKey, now: Date): Date {
  const startMin = SHIFT_START_MIN[shift];
  const hh = String(Math.floor(startMin / 60)).padStart(2, "0");
  const mm = String(startMin % 60).padStart(2, "0");
  let dateKey = easternDateKey(now);
  if (appMinutes(now) >= startMin) {
    dateKey = easternDateKey(new Date(now.getTime() + 24 * 3600 * 1000));
  }
  return new Date(easternInputToUtcISO(`${dateKey}T${hh}:${mm}`));
}

export const SHIFTS: Record<ShiftKey, { label: string; range: string }> = {
  FIRST: { label: "1st Shift", range: "6:00 AM – 2:00 PM" },
  SECOND: { label: "2nd Shift", range: "2:00 PM – 10:00 PM" },
  THIRD: { label: "3rd Shift", range: "10:00 PM – 6:00 AM" },
};

// Which shift is active at `now` (FIRST 6-14, SECOND 14-22, THIRD 22-6),
// evaluated in the warehouse's timezone. Safe on server and client.
export const currentShift = (now: Date): ShiftKey => {
  const cur = appMinutes(now);
  if (cur >= 6 * 60 && cur < 14 * 60) return "FIRST";
  if (cur >= 14 * 60 && cur < 22 * 60) return "SECOND";
  return "THIRD";
};
