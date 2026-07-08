import { APP_TZ, easternDateKey } from "@/lib/time";

// Advance scheduling: admins plan each employee's position for upcoming weekdays
// (Mon–Fri) up to ~7 days out. Each plan is keyed to a specific Eastern date.
// When that date becomes "today", applyDueSchedules() (in scheduleServer.ts)
// copies the plan onto the live board.
//
// This module holds only the pure date helpers, so it's safe to import from
// client components (the assign board). The DB-touching apply function lives in
// @/lib/scheduleServer to keep Prisma out of the client bundle.

export type ScheduleDay = { date: string; label: string; weekday: string };

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

// The selectable planning days: the upcoming weekdays (Mon–Fri) within the next
// 7 days, as Eastern date keys. Excludes today (today is the live board).
export function upcomingScheduleDates(now: Date): ScheduleDay[] {
  const out: ScheduleDay[] = [];
  const seen = new Set<string>();
  for (let d = 1; d <= 7; d++) {
    const inst = new Date(now.getTime() + d * 24 * 3600 * 1000);
    const date = easternDateKey(inst);
    if (seen.has(date)) continue;
    seen.add(date);
    const weekday = new Intl.DateTimeFormat("en-US", {
      timeZone: APP_TZ,
      weekday: "short",
    }).format(inst);
    if (!WEEKDAYS.includes(weekday)) continue;
    const label = new Intl.DateTimeFormat("en-US", {
      timeZone: APP_TZ,
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(inst);
    out.push({ date, label, weekday });
  }
  return out;
}

// True if a date string is a valid, in-window planning day (guards the API).
export function isScheduleDate(date: string, now = new Date()): boolean {
  return upcomingScheduleDates(now).some((d) => d.date === date);
}
