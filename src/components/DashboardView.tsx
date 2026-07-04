"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Tab, Job, Employee, Position } from "@/generated/prisma/client";
import { ThemeToggle } from "@/components/ThemeToggle";

type JobWithRelations = Job & {
  tab: Tab;
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

export function DashboardView({
  tabs,
  jobs,
  isAdmin,
}: {
  tabs: Tab[];
  jobs: JobWithRelations[];
  isAdmin: boolean;
}) {
  const [selectedTabId, setSelectedTabId] = useState<string>("all");

  const visibleJobs = useMemo(
    () =>
      selectedTabId === "all"
        ? jobs
        : jobs.filter((job) => job.tabId === selectedTabId),
    [jobs, selectedTabId]
  );

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-lg font-semibold">Warehouse Dashboard</h1>
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

      <nav className="flex gap-2 overflow-x-auto border-b border-zinc-200 bg-white px-6 py-3 dark:border-zinc-800 dark:bg-zinc-900">
        <button
          onClick={() => setSelectedTabId("all")}
          className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium ${
            selectedTabId === "all"
              ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
              : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          }`}
        >
          All
        </button>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSelectedTabId(tab.id)}
            className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium ${
              selectedTabId === tab.id
                ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            }`}
          >
            {tab.name}
          </button>
        ))}
      </nav>

      <main className="flex-1 px-6 py-6">
        {visibleJobs.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No jobs in this tab yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleJobs.map((job) => (
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
                  Tab: {job.tab.name}
                </div>
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
      </main>
    </div>
  );
}
