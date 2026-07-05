"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Position } from "@/generated/prisma/client";
import { APP_TZ } from "@/lib/time";
import { MAX_VISIBLE_NOTICES } from "@/lib/announcements";
import {
  DashboardSections,
  useNow,
  useAutoRefresh,
  type EmployeeWithRelations,
  type JobWithRelations,
} from "@/components/DashboardSections";

type Notice = {
  id: string;
  message: string;
  expiresAt: string | null;
  createdAt: string;
};

// Format an expiry timestamp for display in the app's timezone.
function fmtExpiry(iso: string | null) {
  if (!iso) return "no expiry";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: APP_TZ,
  });
}

export function AdminDashboard({
  positions,
  employees,
  jobs,
  notices,
  expiredNotices,
}: {
  positions: Position[];
  employees: EmployeeWithRelations[];
  jobs: JobWithRelations[];
  notices: Notice[];
  expiredNotices: Notice[];
}) {
  const now = useNow();
  useAutoRefresh();
  const router = useRouter();

  const [message, setMessage] = useState("");
  const [expiresInput, setExpiresInput] = useState("");
  const [posting, setPosting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const nowMs = now ? now.getTime() : Date.now();
  const isExpired = (n: Notice) =>
    !!n.expiresAt && new Date(n.expiresAt).getTime() <= nowMs;

  // Re-derive against the live clock so the split stays correct between refreshes.
  const active = notices.filter((n) => !isExpired(n));
  const live = active.slice(0, MAX_VISIBLE_NOTICES);
  const queued = active.slice(MAX_VISIBLE_NOTICES);
  // Anything that expired since the server render, then the server's expired set.
  const expired = [...notices.filter(isExpired), ...expiredNotices];

  const post = async () => {
    if (!message.trim()) return;
    setPosting(true);
    await fetch("/api/announcement", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        expiresAt: expiresInput ? new Date(expiresInput).toISOString() : null,
      }),
    });
    setMessage("");
    setExpiresInput("");
    setPosting(false);
    router.refresh();
  };

  const remove = async (id: string) => {
    setBusyId(id);
    await fetch(`/api/announcement/${id}`, { method: "DELETE" });
    setBusyId(null);
    router.refresh();
  };

  const NoticeRow = ({
    n,
    tone,
  }: {
    n: Notice;
    tone: "live" | "queued" | "expired";
  }) => {
    const border =
      tone === "live"
        ? "border-blue-900 bg-blue-950/40"
        : tone === "queued"
          ? "border-zinc-700 bg-zinc-800/60"
          : "border-zinc-800 bg-zinc-900/60 opacity-70";
    return (
      <div
        className={`flex items-start justify-between gap-3 rounded-md border px-3 py-2 ${border}`}
      >
        <div className="min-w-0">
          <div className="text-sm text-zinc-100 break-words">{n.message}</div>
          <div className="mt-0.5 text-xs text-zinc-500">
            {tone === "expired"
              ? `expired ${fmtExpiry(n.expiresAt)}`
              : fmtExpiry(n.expiresAt)}
          </div>
        </div>
        <button
          onClick={() => remove(n.id)}
          disabled={busyId === n.id}
          className="shrink-0 rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:border-red-800 hover:bg-red-950/40 hover:text-red-300 disabled:opacity-50"
        >
          {busyId === n.id ? "…" : "Delete"}
        </button>
      </div>
    );
  };

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
          Post a notice
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") post();
            }}
            placeholder="Notice shown on the dashboards"
            className="flex-1 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500"
          />
          <button
            onClick={post}
            disabled={posting || !message.trim()}
            className="shrink-0 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {posting ? "Posting…" : "Post"}
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

        <p className="mt-3 text-xs text-zinc-500">
          The board shows up to {MAX_VISIBLE_NOTICES} notices at once. Extras
          queue and appear as live ones expire.
        </p>

        {/* On the board now */}
        <div className="mt-4">
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-400">
            On the board now ({live.length}/{MAX_VISIBLE_NOTICES})
          </div>
          {live.length === 0 ? (
            <p className="text-xs text-zinc-600">No active notices.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {live.map((n) => (
                <NoticeRow key={n.id} n={n} tone="live" />
              ))}
            </div>
          )}
        </div>

        {queued.length > 0 && (
          <div className="mt-4">
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-400">
              Queued ({queued.length}) — next up as notices expire
            </div>
            <div className="flex flex-col gap-2">
              {queued.map((n) => (
                <NoticeRow key={n.id} n={n} tone="queued" />
              ))}
            </div>
          </div>
        )}

        {expired.length > 0 && (
          <div className="mt-4">
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-400">
              Recently expired
            </div>
            <div className="flex flex-col gap-2">
              {expired.map((n) => (
                <NoticeRow key={n.id} n={n} tone="expired" />
              ))}
            </div>
          </div>
        )}
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
          announcements={live.map((n) => n.message)}
        />
      </div>
    </div>
  );
}
