"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Job, Employee, Position, Role } from "@/generated/prisma/client";
import { appMinutes, APP_TZ } from "@/lib/time";
import { currentShift, SHIFTS } from "@/lib/shift";
import { todayKey, anniversaryYears, isBirthday } from "@/lib/celebrations";
import { priorityLabel, priorityBadgeClass } from "@/lib/priority";
import { AutoScroll } from "@/components/AutoScroll";

export type EmployeeWithRelations = Employee & {
  position: Position | null;
  roles: Role[];
  capabilities: { id: string; name: string }[];
};

export type JobWithRelations = Job & {
  assignedEmployee: (Employee & { position: Position | null }) | null;
};

const STATUS_LABELS: Record<string, string> = {
  UNASSIGNED: "Unassigned",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In Progress",
  DONE: "Done",
};

const STATUS_COLORS: Record<string, string> = {
  UNASSIGNED: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  ASSIGNED: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  IN_PROGRESS:
    "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  DONE: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
};

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

// End of an employee's lunch: their set end, or 30 minutes after the start.
const lunchEndMinutes = (emp: EmployeeWithRelations) => {
  if (!emp.lunchStart) return null;
  return emp.lunchEnd ? toMinutes(emp.lunchEnd) : toMinutes(emp.lunchStart) + 30;
};

const formatMinutes = (total: number) => {
  const h = String(Math.floor(total / 60) % 24).padStart(2, "0");
  const m = String(total % 60).padStart(2, "0");
  return `${h}:${m}`;
};

// "13:30" -> "1:30 PM"
export const formatClock = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

// Periodically soft-refreshes the current route's server data so displays
// pick up admin-panel changes without a manual reload (no full-page refresh,
// so client state like the clock is preserved).
export function useAutoRefresh(intervalMs = 15000) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);
}

type WakeLockSentinelLike = { release: () => Promise<void> };
type WakeLockNavigator = Navigator & {
  wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
};

// Keep the screen awake while `enabled` (used in TV mode) so a wall-mounted
// display doesn't dim or sleep. Re-acquires the lock when the tab becomes
// visible again (the browser drops it when hidden). No-op where unsupported.
export function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled || typeof navigator === "undefined") return;
    const nav = navigator as WakeLockNavigator;
    if (!nav.wakeLock) return;

    let lock: WakeLockSentinelLike | null = null;
    const request = async () => {
      try {
        lock = await nav.wakeLock!.request("screen");
      } catch {
        // ignore — e.g. denied while not visible
      }
    };
    request();
    const onVisible = () => {
      if (document.visibilityState === "visible") request();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release().catch(() => {});
    };
  }, [enabled]);
}

// Live clock, initialised on mount to avoid a server/client time mismatch.
export function useNow() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

const ATTENDANCE_LABEL: Record<string, string> = {
  ABSENT: "Absent",
  CALLED_OUT: "Called out",
  PTO: "PTO",
};

// Card body for one employee: name on its own line, then all badges/chips and
// roles beneath it. Absent / called-out people are dimmed with a red badge.
function MemberBody({
  member,
  stayingOver = false,
  today = null,
}: {
  member: EmployeeWithRelations;
  stayingOver?: boolean;
  today?: string | null;
}) {
  const anniv = today ? anniversaryYears(member.hireDate, today) : null;
  const birthday = today ? isBirthday(member.birthDate, today) : false;
  const out = member.attendance !== "PRESENT";
  return (
    <div className={out ? "opacity-60" : undefined}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {/* Name + status */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-medium">{member.name}</span>
            {member.isLead && (
              <span className="whitespace-nowrap rounded-full bg-teal-100 px-2 py-0.5 text-xs font-semibold text-teal-800 dark:bg-teal-500/20 dark:text-teal-300">
                Lead
              </span>
            )}
            {out && (
              <span
                className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${
                  member.attendance === "PTO"
                    ? "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300"
                    : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                }`}
              >
                {ATTENDANCE_LABEL[member.attendance]}
              </span>
            )}
            {stayingOver && member.stayOverUntil && (
              <span className="whitespace-nowrap rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">
                Staying over til{" "}
                {new Date(member.stayOverUntil).toLocaleTimeString(undefined, {
                  hour: "numeric",
                  minute: "2-digit",
                  timeZone: APP_TZ,
                })}
              </span>
            )}
            {anniv && (
              <span className="whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
                🎉 {anniv} yr anniversary
              </span>
            )}
            {birthday && (
              <span className="whitespace-nowrap rounded-full bg-pink-100 px-2 py-0.5 text-xs font-semibold text-pink-700 dark:bg-pink-500/20 dark:text-pink-300">
                🎂 Birthday
              </span>
            )}
          </div>
          {/* Position */}
          <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {member.position?.title ?? "No position"}
          </div>
          {/* Roles (capabilities) — bold list */}
          {member.capabilities.length > 0 && (
            <div className="mt-1 text-xs font-bold text-zinc-700 dark:text-zinc-200">
              {member.capabilities.map((c) => c.name).join(" · ")}
            </div>
          )}
        </div>
        {/* Right corner: shift, then break, then lunch */}
        {(member.shift || member.breakStart || member.lunchStart) && (
          <span className="flex shrink-0 flex-col items-end gap-1">
            {member.shift && (
              <span className="whitespace-nowrap rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                {SHIFTS[member.shift].label}
              </span>
            )}
            {member.breakStart && (
              <span className="whitespace-nowrap rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800 dark:bg-orange-500/20 dark:text-orange-300">
                Break {formatClock(member.breakStart)}
              </span>
            )}
            {member.lunchStart && (
              <span className="whitespace-nowrap rounded-full bg-green-700 px-2 py-0.5 text-xs font-medium text-white dark:bg-green-800 dark:text-green-100">
                Lunch {formatClock(member.lunchStart)}
              </span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

// The dashboard sections. `showPositions` groups the team into position
// columns (admin mirror); otherwise a flat roster is shown (public display,
// where positions are intentionally hidden). Pass `now` so shift/lunch logic
// recomputes as the clock ticks.
export function DashboardSections({
  positions,
  employees,
  jobs,
  now,
  showPositions = false,
  showCoverage = false,
  capabilities = [],
  announcements = [],
  horizontalTasks = false,
  autoScroll = false,
  hideEmptyPositions = false,
  tv = false,
}: {
  positions: Position[];
  employees: EmployeeWithRelations[];
  jobs: JobWithRelations[];
  now: Date | null;
  showPositions?: boolean;
  showCoverage?: boolean;
  capabilities?: { id: string; name: string }[];
  announcements?: string[];
  horizontalTasks?: boolean;
  autoScroll?: boolean;
  hideEmptyPositions?: boolean;
  tv?: boolean;
}) {
  // Show only the crew whose shift is active now (employees with no shift set
  // are always shown). Recomputes as the clock crosses a shift boundary.
  const shiftKey = now ? currentShift(now) : null;
  const today = now ? todayKey(now) : null;
  const thisMonth = today ? today.slice(5, 7) : null;

  // This month's work anniversaries and birthdays (across all shown crew), for
  // the celebrations banner. Sorted by day of month.
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthAbbr = thisMonth ? MONTHS[Number(thisMonth) - 1] : "";
  const dayOf = (d: string) => Number(d.slice(8, 10));
  const anniversariesThisMonth = thisMonth
    ? employees
        .filter((e) => e.hireDate && e.hireDate.slice(5, 7) === thisMonth)
        .map((e) => ({
          name: e.name,
          day: dayOf(e.hireDate!),
          years: Number(today!.slice(0, 4)) - Number(e.hireDate!.slice(0, 4)),
        }))
        .filter((a) => a.years >= 1)
        .sort((a, b) => a.day - b.day)
    : [];
  const birthdaysThisMonth = thisMonth
    ? employees
        .filter((e) => e.birthDate && e.birthDate.slice(5, 7) === thisMonth)
        .map((e) => ({ name: e.name, day: dayOf(e.birthDate!) }))
        .sort((a, b) => a.day - b.day)
    : [];
  // Staying over: still within their marked stay-over window (past shift end).
  const stayingOver = (e: EmployeeWithRelations) =>
    !!e.stayOverUntil &&
    !!now &&
    new Date(e.stayOverUntil).getTime() > now.getTime();
  // Show current shift's crew (by clock) + anyone marked to stay over.
  const onShift = (e: EmployeeWithRelations) =>
    !shiftKey ||
    e.shift === null ||
    e.shift === shiftKey ||
    stayingOver(e);
  // Actively staying past their own shift (used for the badge).
  const stayingOverNow = (e: EmployeeWithRelations) =>
    stayingOver(e) && e.shift !== shiftKey;
  const present = (e: EmployeeWithRelations) => e.attendance === "PRESENT";
  // Actively working right now: present and on the current shift (or staying
  // over). These cards get a violet outline, matching the Assign board.
  const activeNow = (e: EmployeeWithRelations) => present(e) && onShift(e);

  const columns = positions.map((position) => {
    const members = employees
      .filter((e) => e.positionId === position.id && onShift(e))
      // Lead(s) first, everyone else keeps the incoming name order.
      .sort((a, b) => Number(b.isLead) - Number(a.isLead));
    return {
      id: position.id,
      title: position.title,
      description: position.description,
      members,
      presentCount: members.filter(present).length,
    };
  });
  const roster = employees.filter(onShift);

  // On the public board, hide positions that have nobody on this shift.
  const visibleColumns = hideEmptyPositions
    ? columns.filter((c) => c.members.length > 0)
    : columns;

  // Positions with nobody present on the current shift (admin view only).
  const understaffed = columns
    .filter((c) => c.presentCount === 0)
    .map((c) => c.title);

  const onShiftCount = roster.length;
  const presentCount = roster.filter(present).length;

  // Side tasks grouped by assigned employee (unassigned last), each group's
  // tasks ordered by priority (highest first).
  const jobGroups = (() => {
    const map = new Map<
      string,
      { name: string; position: string | null; jobs: JobWithRelations[] }
    >();
    for (const job of jobs) {
      const key = job.assignedEmployee?.id ?? "__unassigned__";
      if (!map.has(key)) {
        map.set(key, {
          name: job.assignedEmployee?.name ?? "Unassigned",
          position: job.assignedEmployee?.position?.title ?? null,
          jobs: [],
        });
      }
      map.get(key)!.jobs.push(job);
    }
    const groups = [...map.values()];
    groups.forEach((g) => g.jobs.sort((a, b) => b.priority - a.priority));
    groups.sort((a, b) => {
      if (a.name === "Unassigned") return 1;
      if (b.name === "Unassigned") return -1;
      return a.name.localeCompare(b.name);
    });
    return groups;
  })();

  const onLunch = now
    ? employees.filter((emp) => {
        const end = lunchEndMinutes(emp);
        if (end === null || !emp.lunchStart) return false;
        const cur = appMinutes(now);
        return cur >= toMinutes(emp.lunchStart) && cur < end;
      })
    : [];

  // Everyone on shift with a lunch time, ordered by when they go.
  const lunchSchedule = roster
    .filter((e) => e.lunchStart && e.attendance === "PRESENT")
    .sort((a, b) => toMinutes(a.lunchStart!) - toMinutes(b.lunchStart!));

  return (
    <>
      {announcements.length > 0 && (
        <div className="mb-8 flex flex-col gap-2">
          {announcements.map((message, i) => (
            <div
              key={i}
              className="rounded-lg border border-blue-300 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-200"
            >
              <span className="mr-2 font-semibold uppercase tracking-wide">
                Notice
              </span>
              {message}
            </div>
          ))}
        </div>
      )}

      {showCoverage && understaffed.length > 0 && (
        <div className="mb-8 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">
          <span className="font-semibold">Understaffed this shift:</span>{" "}
          {understaffed.join(", ")}
        </div>
      )}

      {showCoverage && (
        <div className="mb-8 flex flex-wrap gap-2 text-sm">
          <span className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 dark:border-zinc-800 dark:bg-zinc-900">
            <span className="font-semibold">{presentCount}</span> present
          </span>
          <span className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
            {onShiftCount} on shift
          </span>
          {onLunch.length > 0 && (
            <span className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
              {onLunch.length} on lunch
            </span>
          )}
        </div>
      )}

      {/* Role coverage: how many present crew this shift can perform each role. */}
      {showCoverage && capabilities.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Role coverage{shiftKey ? ` — ${SHIFTS[shiftKey].label}` : ""}
          </h2>
          <div className="flex flex-wrap gap-2 text-sm">
            {capabilities.map((cap) => {
              const count = roster.filter(
                (e) =>
                  present(e) && e.capabilities.some((c) => c.id === cap.id)
              ).length;
              return (
                <span
                  key={cap.id}
                  className={`rounded-lg border px-3 py-1.5 ${
                    count === 0
                      ? "border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300"
                      : "border-zinc-200 bg-white text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"
                  }`}
                >
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                    {count}
                  </span>{" "}
                  {cap.name}
                </span>
              );
            })}
          </div>
        </div>
      )}

      <div className="mb-10 grid grid-cols-1 gap-8 lg:grid-cols-2">
      <section>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          On Lunch{onLunch.length > 0 ? ` (${onLunch.length})` : ""}
        </h2>
        {onLunch.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No one is on lunch right now.
          </p>
        ) : (
          <AutoScroll enabled={autoScroll} maxHeightClass="max-h-[32vh]">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {onLunch.map((emp) => (
              <div
                key={emp.id}
                className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40"
              >
                <div className="text-sm font-medium">{emp.name}</div>
                <div className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                  {emp.roles.length > 0
                    ? `${emp.roles.map((r) => r.name).join(" · ")} · `
                    : ""}
                  back at {formatMinutes(lunchEndMinutes(emp)!)}
                </div>
              </div>
            ))}
          </div>
          </AutoScroll>
        )}
      </section>

      {lunchSchedule.length > 0 && (
        <section>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Lunch Schedule
          </h2>
          <AutoScroll enabled={autoScroll} maxHeightClass="max-h-[32vh]">
          <ul className="divide-y divide-zinc-200 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
            {lunchSchedule.map((emp) => (
              <li
                key={emp.id}
                className="flex items-center justify-between gap-3 px-4 py-2"
              >
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="w-20 shrink-0 text-sm font-semibold tabular-nums text-teal-700 dark:text-teal-300">
                    {formatClock(emp.lunchStart!)}
                  </span>
                  <span className="truncate text-sm font-medium">
                    {emp.name}
                  </span>
                </span>
                {emp.position && (
                  <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                    {emp.position.title}
                  </span>
                )}
              </li>
            ))}
          </ul>
          </AutoScroll>
        </section>
      )}
      </div>

      {/* This month's work anniversaries + birthdays (only when there are any). */}
      {(anniversariesThisMonth.length > 0 || birthdaysThisMonth.length > 0) && (
        <div className="mb-8 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm dark:border-amber-900 dark:bg-amber-950/40">
          {anniversariesThisMonth.length > 0 && (
            <div className="text-amber-900 dark:text-amber-200">
              <span className="mr-2 font-semibold">
                🎉 Work anniversaries this month:
              </span>
              {anniversariesThisMonth
                .map((a) => `${a.name} (${a.years} yr — ${monthAbbr} ${a.day})`)
                .join(", ")}
            </div>
          )}
          {birthdaysThisMonth.length > 0 && (
            <div className="mt-1 text-pink-800 dark:text-pink-300">
              <span className="mr-2 font-semibold">🎂 Birthdays this month:</span>
              {birthdaysThisMonth
                .map((b) => `${b.name} (${monthAbbr} ${b.day})`)
                .join(", ")}
            </div>
          )}
        </div>
      )}

      <section className="mb-10">
        <h2 className="mb-4 flex flex-wrap items-baseline gap-x-2 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {showPositions ? "Team by Position" : "Position"}
          {showPositions && shiftKey && (
            <span className="font-medium normal-case tracking-normal text-zinc-400 dark:text-zinc-500">
              — {SHIFTS[shiftKey].label} ({SHIFTS[shiftKey].range})
            </span>
          )}
        </h2>

        {showPositions ? (
          visibleColumns.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {hideEmptyPositions
                ? "No one assigned to a position on this shift."
                : "No positions yet."}
            </p>
          ) : (
            <AutoScroll
              enabled={autoScroll && (tv ? visibleColumns.length > 6 : true)}
              maxHeightClass={tv ? "max-h-[80vh]" : "max-h-[48vh]"}
            >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visibleColumns.map((column) => (
                <div
                  key={column.id}
                  className="flex flex-col rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold">{column.title}</h3>
                      {column.description && (
                        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                          {column.description}
                        </p>
                      )}
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
                        column.presentCount === 0
                          ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                          : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                      }`}
                    >
                      {column.presentCount} present
                    </span>
                  </div>
                  {column.members.length === 0 ? (
                    <p className="text-sm text-zinc-400 dark:text-zinc-600">
                      No one assigned
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-3">
                      {column.members.map((member) => (
                        <li
                          key={member.id}
                          className={`rounded-md border px-3 py-3 ${
                            showCoverage && activeNow(member)
                              ? "border-violet-400 bg-violet-50 ring-1 ring-violet-400 dark:border-violet-600 dark:bg-violet-950/30 dark:ring-violet-600"
                              : "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/50"
                          }`}
                        >
                          <MemberBody member={member} stayingOver={stayingOverNow(member)} today={today} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
            </AutoScroll>
          )
        ) : roster.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No one on shift right now.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {roster.map((member) => (
              <div
                key={member.id}
                className={`rounded-lg border p-4 shadow-sm ${
                  showCoverage && activeNow(member)
                    ? "border-violet-400 bg-violet-50 ring-1 ring-violet-400 dark:border-violet-600 dark:bg-violet-950/30 dark:ring-violet-600"
                    : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                }`}
              >
                <MemberBody member={member} stayingOver={stayingOverNow(member)} today={today} />
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Side Tasks
        </h2>
        {jobs.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No side tasks yet.
          </p>
        ) : (
          <AutoScroll enabled={autoScroll} maxHeightClass="max-h-[40vh]">
          <div
            className={
              horizontalTasks
                ? "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                : "flex flex-col gap-6"
            }
          >
            {jobGroups.map((group) => (
              <div key={group.name}>
                <h3 className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  {group.name}
                  {showPositions && group.position ? ` · ${group.position}` : ""}
                </h3>
                <div
                  className={
                    horizontalTasks
                      ? "flex flex-col gap-4"
                      : "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
                  }
                >
                  {group.jobs.map((job) => (
                    <div
                      key={job.id}
                      className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
                    >
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <h3 className="font-medium">{job.title}</h3>
                        <span className="flex shrink-0 flex-col items-end gap-1">
                          <span
                            className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[job.status]}`}
                          >
                            {STATUS_LABELS[job.status]}
                          </span>
                          {priorityBadgeClass(job.priority) && (
                            <span
                              className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${priorityBadgeClass(job.priority)}`}
                            >
                              {priorityLabel(job.priority)}
                            </span>
                          )}
                        </span>
                      </div>
                      {job.description && (
                        <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
                          {job.description}
                        </p>
                      )}
                      {job.dueDate && (
                        <div className="text-xs text-zinc-500 dark:text-zinc-400">
                          Due:{" "}
                          {new Date(job.dueDate).toLocaleDateString(undefined, {
                            timeZone: "UTC",
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          </AutoScroll>
        )}
      </section>
    </>
  );
}
