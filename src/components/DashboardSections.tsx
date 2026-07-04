"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Job, Employee, Position, Role } from "@/generated/prisma/client";

export type EmployeeWithRelations = Employee & {
  position: Position | null;
  roles: Role[];
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

type ShiftKey = "FIRST" | "SECOND" | "THIRD";

const SHIFTS: Record<ShiftKey, { label: string; range: string }> = {
  FIRST: { label: "1st Shift", range: "6:00 AM – 2:00 PM" },
  SECOND: { label: "2nd Shift", range: "2:00 PM – 10:00 PM" },
  THIRD: { label: "3rd Shift", range: "10:00 PM – 6:00 AM" },
};

// Which shift is active right now (FIRST 6-14, SECOND 14-22, THIRD 22-6).
const currentShift = (now: Date): ShiftKey => {
  const cur = now.getHours() * 60 + now.getMinutes();
  if (cur >= 6 * 60 && cur < 14 * 60) return "FIRST";
  if (cur >= 14 * 60 && cur < 22 * 60) return "SECOND";
  return "THIRD";
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
};

// Card body for one employee: name + shift chip beside it, roles and lunch
// underneath. Absent / called-out people are dimmed with a red badge.
function MemberBody({ member }: { member: EmployeeWithRelations }) {
  const out = member.attendance !== "PRESENT";
  return (
    <div className={out ? "opacity-60" : undefined}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm font-medium">{member.name}</span>
          {out && (
            <span className="whitespace-nowrap rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
              {ATTENDANCE_LABEL[member.attendance]}
            </span>
          )}
          {member.shift && (
            <span className="whitespace-nowrap rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300">
              {SHIFTS[member.shift].label}
            </span>
          )}
        </span>
        {member.lunchStart && (
          <span className="whitespace-nowrap rounded-full bg-green-700 px-2 py-0.5 text-xs font-medium text-white dark:bg-green-800 dark:text-green-100">
            Lunch {formatClock(member.lunchStart)}
          </span>
        )}
      </div>
      {member.roles.length > 0 && (
        <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          {member.roles.map((role) => role.name).join(" · ")}
        </div>
      )}
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
  announcement = null,
}: {
  positions: Position[];
  employees: EmployeeWithRelations[];
  jobs: JobWithRelations[];
  now: Date | null;
  showPositions?: boolean;
  announcement?: string | null;
}) {
  // Show only the crew whose shift is active now (employees with no shift set
  // are always shown). Recomputes as the clock crosses a shift boundary.
  const shiftKey = now ? currentShift(now) : null;
  const onShift = (e: EmployeeWithRelations) =>
    !shiftKey || e.shift === null || e.shift === shiftKey;
  const present = (e: EmployeeWithRelations) => e.attendance === "PRESENT";

  const columns = positions.map((position) => {
    const members = employees.filter(
      (e) => e.positionId === position.id && onShift(e)
    );
    return {
      id: position.id,
      title: position.title,
      members,
      presentCount: members.filter(present).length,
    };
  });
  const roster = employees.filter(onShift);

  // Positions with nobody present on the current shift (admin view only).
  const understaffed = columns
    .filter((c) => c.presentCount === 0)
    .map((c) => c.title);

  const onLunch = now
    ? employees.filter((emp) => {
        const end = lunchEndMinutes(emp);
        if (end === null || !emp.lunchStart) return false;
        const cur = now.getHours() * 60 + now.getMinutes();
        return cur >= toMinutes(emp.lunchStart) && cur < end;
      })
    : [];

  return (
    <>
      {announcement && (
        <div className="mb-8 rounded-lg border border-blue-300 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-200">
          <span className="mr-2 font-semibold uppercase tracking-wide">
            Notice
          </span>
          {announcement}
        </div>
      )}

      {showPositions && understaffed.length > 0 && (
        <div className="mb-8 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">
          <span className="font-semibold">Understaffed this shift:</span>{" "}
          {understaffed.join(", ")}
        </div>
      )}

      <section className="mb-10">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          On Lunch{onLunch.length > 0 ? ` (${onLunch.length})` : ""}
        </h2>
        {onLunch.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No one is on lunch right now.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
        )}
      </section>

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
          columns.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No positions yet.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {columns.map((column) => (
                <div
                  key={column.id}
                  className="flex flex-col rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="font-semibold">{column.title}</h3>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
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
                    <ul className="flex flex-col gap-2">
                      {column.members.map((member) => (
                        <li
                          key={member.id}
                          className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-800/50"
                        >
                          <MemberBody member={member} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
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
                className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
              >
                <MemberBody member={member} />
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {jobs.map((job) => (
              <div
                key={job.id}
                className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <h3 className="font-medium">{job.title}</h3>
                  <span
                    className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[job.status]}`}
                  >
                    {STATUS_LABELS[job.status]}
                  </span>
                </div>
                {job.description && (
                  <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
                    {job.description}
                  </p>
                )}
                <div className="mb-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Assigned to: {job.assignedEmployee?.name ?? "Unassigned"}
                  {showPositions && job.assignedEmployee?.position
                    ? ` (${job.assignedEmployee.position.title})`
                    : ""}
                </div>
                {job.dueDate && (
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    Due: {new Date(job.dueDate).toLocaleDateString()}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
