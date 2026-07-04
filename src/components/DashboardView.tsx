"use client";

import Link from "next/link";
import type { Position } from "@/generated/prisma/client";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  DashboardSections,
  useNow,
  type EmployeeWithRelations,
  type JobWithRelations,
} from "@/components/DashboardSections";

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
  const now = useNow();

  return (
    <div className="flex flex-1 flex-col">
      <header className="grid grid-cols-3 items-center border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-lg font-semibold">Warehouse Dashboard</h1>
        <div className="text-center">
          {now && (
            <>
              <div className="text-sm text-zinc-500 dark:text-zinc-400">
                {now.toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </div>
              <div className="text-3xl font-semibold tabular-nums">
                {now.toLocaleTimeString(undefined, {
                  hour: "numeric",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </div>
            </>
          )}
        </div>
        <div className="flex items-center justify-end gap-4 text-sm">
          <ThemeToggle />
          {isAdmin ? (
            <Link
              href="/admin/assign"
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
        <DashboardSections
          positions={positions}
          employees={employees}
          jobs={jobs}
          now={now}
        />
      </main>
    </div>
  );
}
