"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  APP_TZ,
  easternInputToUtcISO,
  easternDateTimeInput,
} from "@/lib/time";
import { MAX_VISIBLE_NOTICES, splitNotices } from "@/lib/announcements";
import { useNow, useAutoRefresh } from "@/components/DashboardSections";

export type Notice = {
  id: string;
  message: string;
  startsAt: string | null;
  expiresAt: string | null;
  pinned: boolean;
  createdAt: string;
};

// Format an expiry/start timestamp for display in the app's timezone. Includes
// the year only when it differs from now (so far-future events read clearly).
function fmtExpiry(iso: string | null) {
  if (!iso) return "no expiry";
  const d = new Date(iso);
  const opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: APP_TZ,
  };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
  return d.toLocaleString(undefined, opts);
}

// The notices manager: post a notice (immediate or scheduled, optional expiry,
// pinnable) and manage the live / queued / scheduled / recently-expired lists.
export type NoticeLogEntry = {
  id: string;
  message: string;
  postedBy: string | null;
  createdAt: string;
};

// Lives on its own Notices tab.
export function NoticesManager({
  notices,
  expiredNotices,
  events = [],
  log = [],
}: {
  notices: Notice[];
  expiredNotices: Notice[];
  events?: Notice[];
  log?: NoticeLogEntry[];
}) {
  const now = useNow();
  useAutoRefresh();
  const router = useRouter();

  const [message, setMessage] = useState("");
  // Standard expiry is 24 hours out; the admin adjusts it, or clears it for a
  // notice with no expiry.
  const [expiresInput, setExpiresInput] = useState(() =>
    easternDateTimeInput(new Date(Date.now() + 24 * 3600 * 1000))
  );
  // Optional scheduled start, prefilled with the current Eastern time (bump it
  // forward to schedule, or "clear" to show immediately); limited to 48h ahead.
  const [startsInput, setStartsInput] = useState(() =>
    easternDateTimeInput(new Date())
  );
  const [pinNew, setPinNew] = useState(false);
  const [posting, setPosting] = useState(false);
  // Preplanned-event form (far-future scheduling).
  const [eventMessage, setEventMessage] = useState("");
  const [eventStartsInput, setEventStartsInput] = useState(() =>
    easternDateTimeInput(new Date(Date.now() + 7 * 24 * 3600 * 1000))
  );
  const [eventExpiresInput, setEventExpiresInput] = useState("");
  const [postingEvent, setPostingEvent] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const scheduleMin = easternDateTimeInput(new Date());
  const scheduleMax = easternDateTimeInput(
    new Date(Date.now() + 48 * 3600 * 1000)
  );

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
    setStartsInput(easternDateTimeInput(new Date()));
    setExpiresInput(easternDateTimeInput(new Date(Date.now() + 24 * 3600 * 1000)));
    setPinNew(false);
    setPosting(false);
    router.refresh();
  };

  // Schedule a preplanned event far in the future.
  const postEvent = async () => {
    if (!eventMessage.trim()) return;
    setPostingEvent(true);
    await fetch("/api/announcement", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: eventMessage,
        startsAt: eventStartsInput ? easternInputToUtcISO(eventStartsInput) : null,
        expiresAt: eventExpiresInput ? easternInputToUtcISO(eventExpiresInput) : null,
        isEvent: true,
      }),
    });
    setEventMessage("");
    setEventStartsInput(
      easternDateTimeInput(new Date(Date.now() + 7 * 24 * 3600 * 1000))
    );
    setEventExpiresInput("");
    setPostingEvent(false);
    router.refresh();
  };

  // Re-post a message from the history as a fresh, immediate notice.
  const repost = async (id: string, text: string) => {
    setBusyId(id);
    await fetch("/api/announcement", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text }),
    });
    setBusyId(null);
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

  const saveEdit = async (id: string) => {
    if (!editText.trim()) return;
    setBusyId(id);
    await fetch(`/api/announcement/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: editText.trim() }),
    });
    setBusyId(null);
    setEditingId(null);
    setEditText("");
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
    if (editingId === n.id) {
      return (
        <div className={`rounded-md border px-3 py-2 ${border}`}>
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            rows={2}
            autoFocus
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
          />
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => saveEdit(n.id)}
              disabled={busyId === n.id || !editText.trim()}
              className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {busyId === n.id ? "…" : "Save"}
            </button>
            <button
              onClick={() => {
                setEditingId(null);
                setEditText("");
              }}
              className="rounded-md border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
            >
              Cancel
            </button>
          </div>
        </div>
      );
    }
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
              onClick={() => {
                setEditingId(n.id);
                setEditText(n.message);
              }}
              disabled={busyId === n.id}
              className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:border-blue-700 hover:bg-blue-950/30 hover:text-blue-300 disabled:opacity-50"
            >
              Edit
            </button>
          )}
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
    <>
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
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
      {/* The two timing options sit side by side under the post bar. */}
      <div className="mt-2 grid gap-2 sm:grid-cols-2 sm:gap-x-6">
        <label className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
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
        <label className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
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
      </div>
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

    {/* Upcoming events — preplanned notices scheduled weeks or months out. */}
    <div className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400">
        Upcoming events
      </label>
      <p className="mb-2 text-xs text-zinc-500">
        Preplanned company events (weeks or months ahead). Each appears on the
        board on its start date and clears at its end.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={eventMessage}
          onChange={(e) => setEventMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") postEvent();
          }}
          placeholder="Event notice (e.g. Company picnic — noon in the break room)"
          className="flex-1 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500"
        />
        <button
          onClick={postEvent}
          disabled={postingEvent || !eventMessage.trim()}
          className="shrink-0 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {postingEvent ? "Adding…" : "Add event"}
        </button>
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2 sm:gap-x-6">
        <label className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
          Show on the board starting (Eastern):
          <input
            type="datetime-local"
            value={eventStartsInput}
            min={scheduleMin}
            onChange={(e) => setEventStartsInput(e.target.value)}
            style={{ colorScheme: "dark" }}
            className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-100"
          />
        </label>
        <label className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
          Clear at (Eastern, optional):
          <input
            type="datetime-local"
            value={eventExpiresInput}
            onChange={(e) => setEventExpiresInput(e.target.value)}
            style={{ colorScheme: "dark" }}
            className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-100"
          />
          {eventExpiresInput && (
            <button
              type="button"
              onClick={() => setEventExpiresInput("")}
              className="text-zinc-500 hover:text-zinc-300"
            >
              clear
            </button>
          )}
        </label>
      </div>

      <div className="mt-4">
        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-400">
          Scheduled events ({events.length})
        </div>
        {events.length === 0 ? (
          <p className="text-xs text-zinc-600">No events scheduled.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {events.map((n) => (
              <NoticeRow
                key={n.id}
                n={n}
                tone={isScheduled(n) ? "scheduled" : "live"}
              />
            ))}
          </div>
        )}
      </div>
    </div>

    {/* Full posting history — every notice ever posted and by whom; repostable. */}
    <div className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
        Notice history ({log.length})
      </div>
      {log.length === 0 ? (
        <p className="text-xs text-zinc-600">No notices posted yet.</p>
      ) : (
        <ul className="divide-y divide-zinc-800">
          {log.map((l) => (
            <li key={l.id} className="flex items-center gap-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-zinc-200">
                  {l.message}
                </span>
                <span className="text-xs text-zinc-500">
                  {new Date(l.createdAt).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                    timeZone: APP_TZ,
                  })}
                  {l.postedBy ? ` · ${l.postedBy}` : ""}
                </span>
              </span>
              <button
                onClick={() => repost(l.id, l.message)}
                disabled={busyId === l.id}
                className="shrink-0 rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:border-blue-700 hover:bg-blue-950/30 hover:text-blue-300 disabled:opacity-50"
              >
                {busyId === l.id ? "…" : "Repost"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
    </>
  );
}
