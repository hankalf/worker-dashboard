"use client";

import { useState } from "react";
import type { Position } from "@/generated/prisma/client";
import { APP_TZ } from "@/lib/time";
import {
  DashboardSections,
  useNow,
  useAutoRefresh,
  type EmployeeWithRelations,
  type JobWithRelations,
} from "@/components/DashboardSections";

type Announcement = { message: string; expiresAt: string | null };

// ISO string -> value for a <input type="datetime-local">.
function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export function AdminDashboard({
  positions,
  employees,
  jobs,
  announcement,
}: {
  positions: Position[];
  employees: EmployeeWithRelations[];
  jobs: JobWithRelations[];
  announcement: Announcement | null;
}) {
  const now = useNow();
  useAutoRefresh();

  const [message, setMessage] = useState(announcement?.message ?? "");
  const [expiresInput, setExpiresInput] = useState(
    toLocalInput(announcement?.expiresAt ?? null)
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const saveAnnouncement = async () => {
    setSaving(true);
    setSaved(false);
    await fetch("/api/announcement", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        expiresAt: expiresInput ? new Date(expiresInput).toISOString() : null,
      }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  // Only show the banner if it hasn't expired.
  const activeMessage =
    announcement &&
    (!announcement.expiresAt || new Date(announcement.expiresAt) > new Date())
      ? announcement.message
      : null;

  return (
    <div>
      <div className="mb-6 flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-semibold text-white">Admin Dashboard</h2>
        {now && (
          <div className="text-right">
            <div className="text-xs text-zinc-400">
              {now.toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
                timeZone: APP_TZ,
              })}
            </div>
            <div className="text-2xl font-semibold tabular-nums text-white">
              {now.toLocaleTimeString(undefined, {
                hour: "numeric",
                minute: "2-digit",
                second: "2-digit",
                timeZone: APP_TZ,
              })}
            </div>
          </div>
        )}
      </div>

      <div className="mb-8 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400">
          Dashboard announcement
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Pinned message shown on every dashboard (leave blank to clear)"
            className="flex-1 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500"
          />
          <button
            onClick={saveAnnouncement}
            disabled={saving}
            className="shrink-0 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {saving ? "Saving…" : saved ? "Saved ✓" : "Post"}
          </button>
        </div>
        <label className="mt-2 flex items-center gap-2 text-xs text-zinc-400">
          Clear automatically at (optional):
          <input
            type="datetime-local"
            value={expiresInput}
            onChange={(e) => setExpiresInput(e.target.value)}
            style={{ colorScheme: "dark" }}
            className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-100"
          />
          {expiresInput && (
            <button
              type="button"
              onClick={() => setExpiresInput("")}
              className="text-zinc-500 hover:text-zinc-300"
            >
              clear
            </button>
          )}
        </label>
      </div>

      {/* Force dark styling — the admin panel is always dark regardless of the
          public site's light/dark theme. */}
      <div className="dark">
        <DashboardSections
          positions={positions}
          employees={employees}
          jobs={jobs}
          now={now}
          showPositions
          showCoverage
          announcement={activeMessage}
        />
      </div>
    </div>
  );
}
