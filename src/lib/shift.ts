import { appMinutes } from "@/lib/time";

export type ShiftKey = "FIRST" | "SECOND" | "THIRD";

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
