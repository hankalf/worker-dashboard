"use client";

import { useEffect, useState } from "react";
import { APP_TZ } from "@/lib/time";
import { useAdminGuard } from "@/lib/useAdminGuard";

type ActivityLog = {
  id: string;
  category: string;
  action: string;
  actorName: string | null;
  createdAt: string;
};

// Wrap a CSV cell, escaping quotes and wrapping when needed.
const csvCell = (value: string) =>
  /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

const RANGES: { value: string; label: string; days: number | null }[] = [
  { value: "all", label: "All (2 weeks)", days: null },
  { value: "today", label: "Today", days: 1 },
  { value: "3", label: "Last 3 days", days: 3 },
  { value: "7", label: "Last 7 days", days: 7 },
];

export default function ActivityPage() {
  const admin = useAdminGuard();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [range, setRange] = useState("all");

  useEffect(() => {
    if (!admin) return;
    (async () => {
      const res = await fetch("/api/activity-logs");
      if (res.status === 403) {
        window.location.href = "/login";
        return;
      }
      setLogs(await res.json());
      setLoading(false);
    })();
  }, [admin]);

  const categories = Array.from(new Set(logs.map((l) => l.category))).sort();

  const filtered = logs.filter((log) => {
    if (category !== "all" && log.category !== category) return false;
    const rangeDays = RANGES.find((r) => r.value === range)?.days ?? null;
    if (rangeDays !== null) {
      const cutoff =
        range === "today"
          ? new Date(new Date().setHours(0, 0, 0, 0)).getTime()
          : Date.now() - rangeDays * 24 * 60 * 60 * 1000;
      if (new Date(log.createdAt).getTime() < cutoff) return false;
    }
    const q = search.trim().toLowerCase();
    if (
      q &&
      !`${log.category} ${log.action} ${log.actorName ?? ""}`
        .toLowerCase()
        .includes(q)
    )
      return false;
    return true;
  });

  const exportCsv = () => {
    const header = ["Date", "Time", "Category", "Change", "By"];
    const rows = filtered.map((log) => {
      const d = new Date(log.createdAt);
      return [
        d.toLocaleDateString(undefined, { timeZone: APP_TZ }),
        d.toLocaleTimeString(undefined, { timeZone: APP_TZ }),
        log.category,
        log.action,
        log.actorName ?? "",
      ].map(csvCell);
    });
    const csv = [header.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
    // Prepend BOM so Excel reads UTF-8 correctly.
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `activity-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Download ALL log data (activity + side-task logs + position history) as one
  // CSV. Does not delete anything.
  const downloadAll = async () => {
    const res = await fetch("/api/activity-logs/export");
    if (!res.ok) {
      alert("Download failed.");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `warehouse-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Download ALL log data (activity + side-task logs) as one CSV, then clear the
  // database. The download happens first so the archive is safely in hand before
  // anything is deleted.
  const exportAllAndClear = async () => {
    if (
      !confirm(
        "⚠ Export ALL logs and clear the database?\n\n" +
          "A CSV of every activity log, side-task log, and position history entry " +
          "downloads first. Then the activity + side-task rows are deleted. " +
          "Position history stays (auto-deletes after 2 weeks); employees, " +
          "positions and equipment are untouched. This cannot be undone."
      )
    )
      return;

    const res = await fetch("/api/activity-logs/export");
    if (!res.ok) {
      alert("Export failed — nothing was deleted.");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `warehouse-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    const del = await fetch("/api/activity-logs", { method: "DELETE" });
    if (del.ok) {
      setLogs([]);
      alert("Logs exported and cleared.");
    } else {
      alert("Downloaded, but clearing the database failed. Please try again.");
    }
  };

  // Block render until admin is confirmed (supervisors get redirected away).
  if (!admin) return null;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-white">Activity Log</h2>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={exportCsv}
            disabled={filtered.length === 0}
            className="rounded-md bg-green-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-600 disabled:opacity-50"
          >
            Export to Excel
          </button>
          <button
            onClick={downloadAll}
            className="rounded-md bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-600"
          >
            Download all logs
          </button>
          <button
            onClick={exportAllAndClear}
            className="rounded-md border border-red-800 bg-red-950/40 px-3 py-1.5 text-sm font-medium text-red-300 hover:bg-red-900/50"
          >
            Export all &amp; clear DB
          </button>
        </div>
      </div>
      <p className="mb-4 text-sm text-zinc-400">
        Every change (assignments, shifts, lunches, roles, positions, and side
        tasks) is recorded here and kept for 2 weeks.
      </p>

      <div className="mb-4 flex flex-wrap gap-2">
        <input
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-40 flex-1 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100"
        >
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={range}
          onChange={(e) => setRange(e.target.value)}
          className="rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100"
        >
          {RANGES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-zinc-500">
          {logs.length === 0
            ? "No activity recorded yet."
            : "No activity matches these filters."}
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-900 text-xs uppercase tracking-wide text-zinc-400">
              <tr>
                <th className="px-4 py-2 font-medium">When</th>
                <th className="px-4 py-2 font-medium">Category</th>
                <th className="px-4 py-2 font-medium">Change</th>
                <th className="px-4 py-2 font-medium">By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {filtered.map((log) => (
                <tr key={log.id} className="bg-zinc-950/40">
                  <td className="whitespace-nowrap px-4 py-2 text-xs text-zinc-500">
                    {new Date(log.createdAt).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                      timeZone: APP_TZ,
                    })}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2">
                    <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">
                      {log.category}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-zinc-200">{log.action}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-zinc-400">
                    {log.actorName ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
