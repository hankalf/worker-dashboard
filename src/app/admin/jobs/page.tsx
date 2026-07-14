"use client";

import { useEffect, useState } from "react";
import { APP_TZ } from "@/lib/time";
import { PRIORITY_LEVELS, priorityLabel, priorityBadgeClass } from "@/lib/priority";
import { taskDueState, DUE_STATE_LABEL, dueStateBadgeClass } from "@/lib/tasks";
import { useAccessGuard } from "@/lib/useAdminGuard";

type Employee = { id: string; name: string };
type Job = {
  id: string;
  title: string;
  description: string | null;
  status: "UNASSIGNED" | "ASSIGNED" | "IN_PROGRESS" | "DONE";
  assignedEmployeeId: string | null;
  assignedEmployee: Employee | null;
  dueDate: string | null;
  priority: number;
};

type TaskLog = {
  id: string;
  jobTitle: string;
  action: string;
  actorName: string | null;
  createdAt: string;
};

const STATUS_LABELS: Record<Job["status"], string> = {
  UNASSIGNED: "Unassigned",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In Progress",
  DONE: "Done",
};

const STATUS_COLORS: Record<Job["status"], string> = {
  UNASSIGNED: "bg-zinc-800 text-zinc-300",
  ASSIGNED: "bg-blue-950 text-blue-300",
  IN_PROGRESS: "bg-amber-950 text-amber-300",
  DONE: "bg-green-950 text-green-300",
};

const emptyForm = {
  title: "",
  description: "",
  assignedEmployeeId: "",
  status: "UNASSIGNED" as Job["status"],
  dueDate: "",
  priority: 0,
};

// List filters: which side tasks to show. "open" = anything not yet done.
type Filter = "all" | "open" | "overdue" | "done";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "overdue", label: "Overdue" },
  { key: "done", label: "Done" },
];

export default function JobsPage() {
  // Side Tasks is available to Lead and up (NONE is bounced to login).
  const guarded = useAccessGuard("LEAD");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [logs, setLogs] = useState<TaskLog[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  const load = async () => {
    const [jobsRes, employeesRes, logsRes] = await Promise.all([
      fetch("/api/jobs"),
      fetch("/api/employees"),
      fetch("/api/task-logs"),
    ]);
    if (employeesRes.status === 403 || jobsRes.status === 403) {
      // Session no longer has panel access — send them back to sign in
      window.location.href = "/login";
      return;
    }
    // Default to empty arrays on any non-OK response so the page never crashes.
    const arr = async <T,>(res: Response): Promise<T[]> =>
      res.ok ? await res.json() : [];
    setJobs(await arr<Job>(jobsRes));
    setEmployees(await arr<Employee>(employeesRes));
    setLogs(await arr<TaskLog>(logsRes));
  };

  useEffect(() => {
    load();
  }, []);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const url = editingId ? `/api/jobs/${editingId}` : "/api/jobs";
    const method = editingId ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        assignedEmployeeId: form.assignedEmployeeId || null,
        dueDate: form.dueDate || null,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Something went wrong");
      return;
    }

    resetForm();
    load();
  };

  const handleEdit = (job: Job) => {
    setEditingId(job.id);
    setForm({
      title: job.title,
      description: job.description ?? "",
      assignedEmployeeId: job.assignedEmployeeId ?? "",
      status: job.status,
      dueDate: job.dueDate ? job.dueDate.slice(0, 10) : "",
      priority: job.priority,
    });
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this side task?")) return;
    await fetch(`/api/jobs/${id}`, { method: "DELETE" });
    load();
  };

  const inputClass =
    "rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500";

  if (!guarded) {
    return <p className="text-sm text-zinc-500">Checking access…</p>;
  }

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold text-white">Side Tasks</h2>

      {/* Two-pane: form stays readable on the left, list fills the window. */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-4 lg:w-[26rem] lg:shrink-0"
      >
        <input
          placeholder="Title"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          required
          className={inputClass}
        />
        <textarea
          placeholder="Description (optional)"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          className={inputClass}
        />
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-zinc-400">
            Assigned to
            <select
              value={form.assignedEmployeeId}
              onChange={(e) =>
                setForm({ ...form, assignedEmployeeId: e.target.value })
              }
              className={`mt-1 block w-full ${inputClass}`}
            >
              <option value="">Unassigned</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-zinc-400">
            Status
            <select
              value={form.status}
              onChange={(e) =>
                setForm({ ...form, status: e.target.value as Job["status"] })
              }
              className={`mt-1 block w-full ${inputClass}`}
            >
              <option value="UNASSIGNED">Unassigned</option>
              <option value="ASSIGNED">Assigned</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="DONE">Done</option>
            </select>
          </label>
          <label className="text-xs text-zinc-400">
            Due date
            <input
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              style={{ colorScheme: "dark" }}
              className={`mt-1 block w-full ${inputClass}`}
            />
          </label>
          <label className="text-xs text-zinc-400">
            Priority
            <select
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
              className={`mt-1 block w-full ${inputClass}`}
            >
              {PRIORITY_LEVELS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
          >
            {editingId ? "Save changes" : "Add side task"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="min-w-0 flex-1">
      {(() => {
        const now = new Date();
        const openCount = jobs.filter((j) => j.status !== "DONE").length;
        const overdueCount = jobs.filter(
          (j) => taskDueState(j.dueDate, j.status, now) === "overdue"
        ).length;
        const visible = jobs.filter((job) => {
          switch (filter) {
            case "open":
              return job.status !== "DONE";
            case "overdue":
              return taskDueState(job.dueDate, job.status, now) === "overdue";
            case "done":
              return job.status === "DONE";
            default:
              return true;
          }
        });

        return (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <div className="flex flex-wrap gap-1">
                {FILTERS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFilter(f.key)}
                    className={`rounded-md px-3 py-1 text-sm font-medium ${
                      filter === f.key
                        ? "bg-blue-600 text-white"
                        : "border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                    }`}
                  >
                    {f.label}
                    {f.key === "overdue" && overdueCount > 0 && (
                      <span className="ml-1.5 rounded-full bg-red-500/80 px-1.5 text-xs text-white">
                        {overdueCount}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <span className="text-xs text-zinc-500">
                {openCount} open
                {overdueCount > 0 && (
                  <span className="text-red-400"> · {overdueCount} overdue</span>
                )}
              </span>
            </div>

            <ul className="flex flex-col gap-2">
              {visible.length === 0 ? (
                <li className="rounded-lg border border-dashed border-zinc-800 p-3 text-sm text-zinc-500">
                  No side tasks match this filter.
                </li>
              ) : (
                visible.map((job) => {
                  const dueState = taskDueState(job.dueDate, job.status, now);
                  return (
                    <li
                      key={job.id}
                      className={`flex items-center justify-between rounded-lg border bg-zinc-900 p-3 ${
                        dueState === "overdue"
                          ? "border-l-2 border-l-red-500 border-zinc-800"
                          : "border-zinc-800"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-white">{job.title}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                          <span
                            className={`rounded-full px-2 py-0.5 font-medium ${STATUS_COLORS[job.status]}`}
                          >
                            {STATUS_LABELS[job.status]}
                          </span>
                          <span>{job.assignedEmployee?.name ?? "Unassigned"}</span>
                          {job.dueDate && (
                            <span>
                              Due{" "}
                              {new Date(job.dueDate).toLocaleDateString(undefined, {
                                timeZone: "UTC",
                              })}
                            </span>
                          )}
                          {dueState !== "none" && (
                            <span
                              className={`rounded-full px-2 py-0.5 font-medium ${dueStateBadgeClass(dueState)}`}
                            >
                              {DUE_STATE_LABEL[dueState]}
                            </span>
                          )}
                          {priorityBadgeClass(job.priority) && (
                            <span
                              className={`rounded-full px-2 py-0.5 font-medium ${priorityBadgeClass(job.priority)}`}
                            >
                              {priorityLabel(job.priority)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-3 text-sm">
                        <button
                          onClick={() => handleEdit(job)}
                          className="text-zinc-400 hover:text-white"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(job.id)}
                          className="text-red-400 hover:text-red-300"
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  );
                })
              )}
            </ul>
          </>
        );
      })()}

      <h3 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-zinc-400">
        Activity Log
      </h3>
      {logs.length === 0 ? (
        <p className="text-sm text-zinc-500">No activity yet.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {logs.map((log) => (
            <li
              key={log.id}
              className="flex items-baseline justify-between gap-3 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm"
            >
              <span className="text-zinc-300">
                <span className="font-medium text-white">{log.jobTitle}</span>
                {" — "}
                {log.action}
                {log.actorName && (
                  <span className="text-zinc-500"> by {log.actorName}</span>
                )}
              </span>
              <span className="whitespace-nowrap text-xs text-zinc-500">
                {new Date(log.createdAt).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                  timeZone: APP_TZ,
                })}
              </span>
            </li>
          ))}
        </ul>
      )}
      </div>
      </div>
    </div>
  );
}
