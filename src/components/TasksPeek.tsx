"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { priorityBadgeClass, priorityLabel } from "@/lib/priority";

type Job = {
  id: string;
  title: string;
  status: string;
  priority: number;
  assignedEmployee: { name: string } | null;
};

const STATUS_LABEL: Record<string, string> = {
  UNASSIGNED: "Unassigned",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In progress",
  DONE: "Done",
};

// Compact read-only peek at the open side tasks, shown next to the shift
// handoff notes on the Assign tab so supervisors see outstanding work while
// they plan the board. Refreshes every 60s; managed on the Side Tasks tab.
export function TasksPeek() {
  const [jobs, setJobs] = useState<Job[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const data: Job[] = await (await fetch("/api/jobs")).json();
        if (Array.isArray(data)) setJobs(data.filter((j) => j.status !== "DONE"));
      } catch {
        // keep the last good copy
      }
    };
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex flex-col rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-400">
          Open side tasks ({jobs.length})
        </span>
        <Link
          href="/admin/jobs"
          className="text-xs font-medium text-blue-400 hover:text-blue-300"
        >
          Manage →
        </Link>
      </div>
      {jobs.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-600">No open tasks.</p>
      ) : (
        <ul className="mt-2 max-h-56 divide-y divide-zinc-800 overflow-y-auto pr-1">
          {jobs.map((j) => (
            <li key={j.id} className="flex items-center gap-2 py-1.5">
              <span className="min-w-0 flex-1 truncate text-sm text-zinc-200">
                {j.title}
              </span>
              {priorityBadgeClass(j.priority) && (
                <span
                  className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium ${priorityBadgeClass(j.priority)}`}
                >
                  {priorityLabel(j.priority)}
                </span>
              )}
              <span className="whitespace-nowrap text-xs text-zinc-500">
                {j.assignedEmployee?.name ?? STATUS_LABEL[j.status]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
