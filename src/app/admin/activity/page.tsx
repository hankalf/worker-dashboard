"use client";

import { useEffect, useState } from "react";

type ActivityLog = {
  id: string;
  category: string;
  action: string;
  createdAt: string;
};

// Wrap a CSV cell, escaping quotes and wrapping when needed.
const csvCell = (value: string) =>
  /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

export default function ActivityPage() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/activity-logs");
      if (res.status === 403) {
        window.location.href = "/login";
        return;
      }
      setLogs(await res.json());
      setLoading(false);
    })();
  }, []);

  const exportCsv = () => {
    const header = ["Date", "Time", "Category", "Change"];
    const rows = logs.map((log) => {
      const d = new Date(log.createdAt);
      return [
        d.toLocaleDateString(),
        d.toLocaleTimeString(),
        log.category,
        log.action,
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

  return (
    <div className="max-w-4xl">
      <div className="mb-1 flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-white">Activity Log</h2>
        <button
          onClick={exportCsv}
          disabled={logs.length === 0}
          className="shrink-0 rounded-md bg-green-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-600 disabled:opacity-50"
        >
          Export to Excel
        </button>
      </div>
      <p className="mb-4 text-sm text-zinc-400">
        Every change (assignments, shifts, lunches, roles, positions, and side
        tasks) is recorded here and kept for 2 weeks.
      </p>

      {loading ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : logs.length === 0 ? (
        <p className="text-sm text-zinc-500">No activity recorded yet.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-900 text-xs uppercase tracking-wide text-zinc-400">
              <tr>
                <th className="px-4 py-2 font-medium">When</th>
                <th className="px-4 py-2 font-medium">Category</th>
                <th className="px-4 py-2 font-medium">Change</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {logs.map((log) => (
                <tr key={log.id} className="bg-zinc-950/40">
                  <td className="whitespace-nowrap px-4 py-2 text-xs text-zinc-500">
                    {new Date(log.createdAt).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2">
                    <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">
                      {log.category}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-zinc-200">{log.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
