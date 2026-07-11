import { APP_TZ, easternDateKey } from "@/lib/time";

// Advance scheduling: admins plan each employee's position for the upcoming week
// — all 7 days (Mon–Sun, weekends included so people can be planned in for
// weekend work). Each plan is keyed to a specific Eastern date. When that date
// becomes "today", applyDueSchedules() (in scheduleServer.ts) copies the plan
// onto the live board.
//
// This module holds only the pure date helpers, so it's safe to import from
// client components (the assign board). The DB-touching apply function lives in
// @/lib/scheduleServer to keep Prisma out of the client bundle.

export type ScheduleDay = { date: string; label: string; weekday: string };

// The selectable planning days: the next 7 calendar days (every day of the
// week), as Eastern date keys. Excludes today (today is the live board).
export function upcomingScheduleDates(now: Date): ScheduleDay[] {
  const out: ScheduleDay[] = [];
  const seen = new Set<string>();
  // Iterate a little past 7 so a DST day-length wobble can't drop us below 7
  // distinct dates; stop once we've collected the week.
  for (let d = 1; out.length < 7 && d <= 10; d++) {
    const inst = new Date(now.getTime() + d * 24 * 3600 * 1000);
    const date = easternDateKey(inst);
    if (seen.has(date)) continue;
    seen.add(date);
    const weekday = new Intl.DateTimeFormat("en-US", {
      timeZone: APP_TZ,
      weekday: "short",
    }).format(inst);
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
