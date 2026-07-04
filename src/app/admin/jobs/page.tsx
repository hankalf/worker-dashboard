"use client";

import { useEffect, useState } from "react";

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
  createdAt: string;
};

const emptyForm = {
  title: "",
  description: "",
  assignedEmployeeId: "",
  status: "UNASSIGNED" as Job["status"],
  dueDate: "",
  priority: 0,
};

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [logs, setLogs] = useState<TaskLog[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const [jobsRes, employeesRes, logsRes] = await Promise.all([
      fetch("/api/jobs"),
      fetch("/api/employees"),
      fetch("/api/task-logs"),
    ]);
    if (employeesRes.status === 403) {
      // Session no longer maps to an admin — send them back to sign in
      window.location.href = "/login";
      return;
    }
    setJobs(await jobsRes.json());
    setEmployees(await employeesRes.json());
    setLogs(await logsRes.json());
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

  return (
    <div className="max-w-3xl">
      <h2 className="mb-4 text-lg font-semibold text-white">Side Tasks</h2>

      <form
        onSubmit={handleSubmit}
        className="mb-6 flex flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-4"
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
          <select
            value={form.assignedEmployeeId}
            onChange={(e) =>
              setForm({ ...form, assignedEmployeeId: e.target.value })
            }
            className={inputClass}
          >
            <option value="">Unassigned</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name}
              </option>
            ))}
          </select>
          <select
            value={form.status}
            onChange={(e) =>
              setForm({ ...form, status: e.target.value as Job["status"] })
            }
            className={inputClass}
          >
            <option value="UNASSIGNED">Unassigned</option>
            <option value="ASSIGNED">Assigned</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="DONE">Done</option>
          </select>
          <input
            type="date"
            value={form.dueDate}
            onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
            className={inputClass}
          />
          <label className="text-xs text-zinc-400">
            Priority
            <input
              type="number"
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
              className={`mt-1 block w-full ${inputClass}`}
            />
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

      <ul className="flex flex-col gap-2">
        {jobs.map((job) => (
          <li
            key={job.id}
            className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 p-3"
          >
            <div>
              <div className="font-medium text-white">{job.title}</div>
              <div className="text-xs text-zinc-400">
                {job.status} · {job.assignedEmployee?.name ?? "Unassigned"}
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
        ))}
      </ul>

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
              </span>
              <span className="whitespace-nowrap text-xs text-zinc-500">
                {new Date(log.createdAt).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
