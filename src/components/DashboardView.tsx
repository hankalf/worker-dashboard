"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Job, Employee, Position, Role } from "@/generated/prisma/client";
import { ThemeToggle } from "@/components/ThemeToggle";

type EmployeeWithRelations = Employee & {
  position: Position | null;
  roles: Role[];
};

type JobWithRelations = Job & {
  assignedEmployee: (Employee & { position: Position | null }) | null;
};

const STATUS_LABELS: Record<string, string> = {
  UNASSIGNED: "Unassigned",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In Progress",
  DONE: "Done",
};

const STATUS_COLORS: Record<string, string> = {
  UNASSIGNED:
    "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
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

export function DashboardView({
  positions,
  employees,
  jobs,
  isAdmin,
}: {
  positions: Position[];
  employees: EmployeeWithRelations[];
  jobs: JobWithRelations[];
  isAdmin: boolean;
}) {
  // Live clock — initialised on mount to avoid a server/client time mismatch
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const unassigned = employees.filter((e) => !e.positionId);
  const columns = [
    ...positions.map((position) => ({
      id: position.id,
      title: position.title,
      members: employees.filter((e) => e.positionId === position.id),
    })),
    ...(unassigned.length > 0
      ? [{ id: "unassigned", title: "Unassigned", members: unassigned }]
      : []),
  ];

  const onLunch = now
    ? employees.filter((emp) => {
        const end = lunchEndMinutes(emp);
        if (end === null || !emp.lunchStart) return false;
        const cur = now.getHours() * 60 + now.getMinutes();
        return cur >= toMinutes(emp.lunchStart) && cur < end;
      })
    : [];

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div>
          <h1 className="text-lg font-semibold">Warehouse Dashboard</h1>
          {now && (
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              {now.toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })}{" "}
              ·{" "}
              {now.toLocaleTimeString(undefined, {
                hour: "numeric",
                minute: "2-digit",
                second: "2-digit",
              })}
            </p>
          )}
        </div>
        <div className="flex items-center gap-4 text-sm">
          <ThemeToggle />
          {isAdmin ? (
            <Link
              href="/admin"
              className="rounded-md bg-zinc-900 px-3 py-1.5 font-medium text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Admin Panel
            </Link>
          ) : (
            <Link
              href="/login"
              className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
            >
              Admin login
            </Link>
          )}
        </div>
      </header>

      <main className="flex-1 px-6 py-6">
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
                    {emp.position?.title ?? "Unassigned"} · back at{" "}
                    {formatMinutes(lunchEndMinutes(emp)!)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Team by Position
          </h2>
          {columns.length === 0 ? (
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
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                      {column.members.length}
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
                          <div className="text-sm font-medium">
                            {member.name}
                          </div>
                          {member.roles.length > 0 && (
                            <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                              {member.roles.map((role) => role.name).join(" · ")}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Jobs
          </h2>
          {jobs.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No jobs yet.
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
                    {job.assignedEmployee?.position
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
      </main>
    </div>
  );
}
