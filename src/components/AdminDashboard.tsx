"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Position } from "@/generated/prisma/client";
import {
  APP_TZ,
  easternInputToUtcISO,
  easternDateTimeInput,
} from "@/lib/time";
import { currentShift, SHIFTS, type ShiftKey } from "@/lib/shift";
import { MAX_VISIBLE_NOTICES, splitNotices } from "@/lib/announcements";
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
  startsAt: string | null;
  expiresAt: string | null;
  pinned: boolean;
  createdAt: string;
};

type ShiftNote = {
  id: string;
  message: string;
  updatedByName: string | null;
  updatedAt: string;
};

const HANDOFF_SHIFTS: ShiftKey[] = ["FIRST", "SECOND", "THIRD"];

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
  shiftNotes,
}: {
  positions: Position[];
  employees: EmployeeWithRelations[];
  jobs: JobWithRelations[];
  notices: Notice[];
  expiredNotices: Notice[];
  shiftNotes: ShiftNote[];
}) {
  const now = useNow();
  useAutoRefresh();
  const router = useRouter();

  const [message, setMessage] = useState("");
  // Prefilled with the current Eastern date/time as a starting point; the admin
  // bumps it forward, or clears it for a notice with no expiry.
  const [expiresInput, setExpiresInput] = useState(() =>
    easternDateTimeInput(new Date())
  );
  // Optional scheduled start (blank = show immediately), limited to 48h ahead.
  const [startsInput, setStartsInput] = useState("");
  const [pinNew, setPinNew] = useState(false);
  const [posting, setPosting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const scheduleMin = easternDateTimeInput(new Date());
  const scheduleMax = easternDateTimeInput(
    new Date(Date.now() + 48 * 3600 * 1000)
  );

  const notesById = Object.fromEntries(shiftNotes.map((n) => [n.id, n]));
  const handoffNotes = Object.fromEntries(
    shiftNotes.map((n) => [n.id, n.message])
  );
  const nowShift = now ? currentShift(now) : null;
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      HANDOFF_SHIFTS.map((s) => [s, notesById[s]?.message ?? ""])
    )
  );
  const [savingShift, setSavingShift] = useState<string | null>(null);
  const [savedShift, setSavedShift] = useState<string | null>(null);

  const saveHandoff = async (shift: ShiftKey) => {
    setSavingShift(shift);
    await fetch("/api/shift-notes", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shift, message: drafts[shift] }),
    });
    setSavingShift(null);
    setSavedShift(shift);
    setTimeout(() => setSavedShift(null), 2000);
    router.refresh();
  };

  const nowMs = now ? now.getTime() : Date.now();
  const isExpired = (n: Notice) =>
    !!n.expiresAt && new Date(n.expiresAt).getTime() <= nowMs;
  const isScheduled = (n: Notice) =>
    !!n.startsAt && new Date(n.startsAt).getTime() > nowMs;

  // Re-derive against the live clock so the split stays correct between refreshes.
  const active = notices.filter((n) => !isExpired(n) && !isScheduled(n));
  const scheduled = notices.filter((n) => !isExpired(n) && isScheduled(n));
  const { visible: live, queued } = splitNotices(active);
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
        // Interpret the picked times as Eastern (the warehouse's timezone),
        // not the admin's browser timezone.
        startsAt: startsInput ? easternInputToUtcISO(startsInput) : null,
        expiresAt: expiresInput ? easternInputToUtcISO(expiresInput) : null,
        pinned: pinNew,
      }),
    });
    setMessage("");
    setStartsInput("");
    setExpiresInput(easternDateTimeInput(new Date()));
    setPinNew(false);
    setPosting(false);
    router.refresh();
  };

  const togglePin = async (id: string, pinned: boolean) => {
    setBusyId(id);
    await fetch(`/api/announcement/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned }),
    });
    setBusyId(null);
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
    tone: "live" | "queued" | "scheduled" | "expired";
  }) => {
    const border =
      tone === "live"
        ? "border-blue-900 bg-blue-950/40"
        : tone === "queued"
          ? "border-zinc-700 bg-zinc-800/60"
          : tone === "scheduled"
            ? "border-sky-900 bg-sky-950/30"
            : "border-zinc-800 bg-zinc-900/60 opacity-70";
    return (
      <div
        className={`flex items-start justify-between gap-3 rounded-md border px-3 py-2 ${border}`}
      >
        <div className="min-w-0">
          <div className="text-sm text-zinc-100 break-words">
            {n.pinned && (
              <span className="mr-2 whitespace-nowrap rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-300">
                Pinned
              </span>
            )}
            {n.message}
          </div>
          <div className="mt-0.5 text-xs text-zinc-500">
            {tone === "expired"
              ? `expired ${fmtExpiry(n.expiresAt)}`
              : tone === "scheduled"
                ? `starts ${fmtExpiry(n.startsAt)}${
                    n.expiresAt ? ` · until ${fmtExpiry(n.expiresAt)}` : ""
                  }`
                : fmtExpiry(n.expiresAt)}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {tone !== "expired" && (
            <button
              onClick={() => togglePin(n.id, !n.pinned)}
              disabled={busyId === n.id}
              className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:border-amber-700 hover:bg-amber-950/30 hover:text-amber-300 disabled:opacity-50"
            >
              {n.pinned ? "Unpin" : "Pin"}
            </button>
          )}
          <button
            onClick={() => remove(n.id)}
            disabled={busyId === n.id}
            className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:border-red-800 hover:bg-red-950/40 hover:text-red-300 disabled:opacity-50"
          >
            {busyId === n.id ? "…" : "Delete"}
          </button>
        </div>
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
          Shift handoff notes
        </label>
        <p className="text-xs text-zinc-500">
          Shown above the notices for whichever shift is active. Leave blank to
          clear.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {HANDOFF_SHIFTS.map((shift) => (
            <div
              key={shift}
              className={`rounded-md border p-3 ${
                nowShift === shift
                  ? "border-violet-700 bg-violet-950/30"
                  : "border-zinc-700 bg-zinc-800/40"
              }`}
            >
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-200">
                  {SHIFTS[shift].label}
                </span>
                {nowShift === shift && (
                  <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] font-semibold text-violet-300">
                    ACTIVE
                  </span>
                )}
              </div>
              <textarea
                value={drafts[shift]}
                onChange={(e) =>
                  setDrafts((d) => ({ ...d, [shift]: e.target.value }))
                }
                rows={3}
                placeholder="Notes for the incoming crew…"
                className="w-full resize-y rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-100 placeholder-zinc-500"
              />
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="truncate text-[10px] text-zinc-500">
                  {notesById[shift]?.updatedByName
                    ? `by ${notesById[shift].updatedByName}`
                    : ""}
                </span>
                <button
                  onClick={() => saveHandoff(shift)}
                  disabled={savingShift === shift}
                  className="shrink-0 rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
                >
                  {savingShift === shift
                    ? "Saving…"
                    : savedShift === shift
                      ? "Saved ✓"
                      : "Save"}
                </button>
              </div>
            </div>
          ))}
        </div>
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
        <label className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
          Show starting at (Eastern, optional, up to 48h ahead):
          <input
            type="datetime-local"
            value={startsInput}
            min={scheduleMin}
            max={scheduleMax}
            onChange={(e) => setStartsInput(e.target.value)}
            style={{ colorScheme: "dark" }}
            className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-100"
          />
          {startsInput && (
            <button
              type="button"
              onClick={() => setStartsInput("")}
              className="text-zinc-500 hover:text-zinc-300"
            >
              clear
            </button>
          )}
        </label>
        <label className="mt-2 flex items-center gap-2 text-xs text-zinc-400">
          Clear automatically at (Eastern, optional):
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
        <label className="mt-2 flex items-center gap-2 text-xs text-zinc-400">
          <input
            type="checkbox"
            checked={pinNew}
            onChange={(e) => setPinNew(e.target.checked)}
          />
          Pin this notice — always shown, ignores the {MAX_VISIBLE_NOTICES}-notice
          cap
        </label>

        <p className="mt-3 text-xs text-zinc-500">
          The board shows up to {MAX_VISIBLE_NOTICES} notices at once (pinned
          ones always show). Extras queue and appear as live ones expire.
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

        {scheduled.length > 0 && (
          <div className="mt-4">
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-400">
              Scheduled ({scheduled.length}) — appear at their start time
            </div>
            <div className="flex flex-col gap-2">
              {scheduled.map((n) => (
                <NoticeRow key={n.id} n={n} tone="scheduled" />
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
          handoffNotes={handoffNotes}
        />
      </div>
    </div>
  );
}
