"use client";

import { useMemo, useState } from "react";
import { APP_TZ } from "@/lib/time";
import { useNow } from "@/components/DashboardSections";
import { AutoScroll } from "@/components/AutoScroll";
import type { DockSchedule } from "@/lib/opendock";

// A wall-display view of today's Opendock dock schedule: one row per
// appointment with its door, time, status and the people tagged on it.
//
// Which statuses are hidden by default is an admin setting (Settings →
// Rotating dashboard), so every screen comes up filtered the same way with no
// interaction. The chips still toggle for anyone looking at the board on a
// desktop; that's a per-view adjustment and deliberately isn't persisted.

const TONE_ORDER = [
  "active",
  "arrived",
  "scheduled",
  "requested",
  "done",
  "other",
] as const;
type Tone = (typeof TONE_ORDER)[number];

const TONE_LABEL: Record<Tone, string> = {
  active: "In progress",
  arrived: "Arrived",
  scheduled: "Scheduled",
  requested: "Requested",
  done: "Completed",
  other: "Cancelled / other",
};

// Row treatment per tone — high contrast in both themes, readable across a
// warehouse. The /10 tints sit correctly on light and dark backgrounds alike.
const TONE_ROW: Record<Tone, string> = {
  active: "border-l-blue-500 bg-blue-500/10",
  arrived: "border-l-amber-500 bg-amber-500/10",
  scheduled: "border-l-zinc-400 dark:border-l-zinc-500",
  requested: "border-l-zinc-300 dark:border-l-zinc-700",
  done: "border-l-green-500 bg-green-500/5 opacity-70",
  other: "border-l-zinc-300 opacity-50 dark:border-l-zinc-700",
};

const TONE_PILL: Record<Tone, string> = {
  active: "bg-blue-100 text-blue-800 dark:bg-blue-500/25 dark:text-blue-200",
  arrived: "bg-amber-100 text-amber-800 dark:bg-amber-500/25 dark:text-amber-200",
  scheduled: "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200",
  requested: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  done: "bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-300",
  other: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

// A rejected load overrides the status tone entirely — red row, red rail, no
// dimming even when it is also completed or cancelled, so it stays obvious.
const REJECTED_ROW =
  "border-l-red-600 bg-red-500/15 dark:border-l-red-500 dark:bg-red-500/20";
const REJECTED_PILL =
  "bg-red-600 text-white dark:bg-red-600 dark:text-white";

// Late or overdue: amber, sitting between the normal status tones and the red
// of a rejected load.
const LATE_ROW =
  "border-l-amber-500 bg-amber-400/20 dark:border-l-amber-400 dark:bg-amber-500/20";

const timeFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TZ,
  hour: "numeric",
  minute: "2-digit",
});

const clock = (iso: string | null): string =>
  iso ? timeFmt.format(new Date(iso)) : "—";

// "1h 24m" / "42m" / "—". Kept compact so the column stays narrow.
function duration(ms: number | null): string {
  if (ms === null || ms < 0) return "—";
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
}

// How long an appointment has been waiting past its slot with no truck yet.
// Null once it has arrived, or for cancelled/completed rows where "overdue"
// would be meaningless.
function overdueMs(
  e: { scheduledAt: string | null; arrivedAt: string | null; tone: string },
  now: Date | null
): number | null {
  if (e.arrivedAt || !e.scheduledAt || !now) return null;
  if (e.tone === "other" || e.tone === "done") return null;
  const late = now.getTime() - Date.parse(e.scheduledAt);
  return late > 0 ? late : null;
}

// Arrival against the booked slot. At or before the slot is on time; after it
// reads as how late the truck was. A no-show past its slot reads as overdue.
function onTime(
  ms: number | null,
  overdue: number | null
): { text: string; className: string } {
  if (overdue !== null)
    return {
      text: `Overdue ${duration(overdue)}`,
      className: "font-semibold text-amber-700 dark:text-amber-300",
    };
  if (ms === null) return { text: "—", className: "text-zinc-500" };
  if (ms <= 0)
    return {
      text: "On time",
      className: "text-green-700 dark:text-green-400",
    };
  return {
    text: `+${duration(ms)}`,
    className:
      ms > 30 * 60_000
        ? "text-red-600 dark:text-red-400"
        : "text-amber-600 dark:text-amber-400",
  };
}

function parseHidden(raw: string | null): Set<Tone> {
  if (!raw) return new Set();
  const wanted = raw.split(",").map((s) => s.trim().toLowerCase());
  return new Set(TONE_ORDER.filter((t) => wanted.includes(t)));
}

export function DockScheduleView({
  schedule,
  title,
  initialHidden,
  interactive = true,
  embedded = false,
  autoScroll = false,
  scrollSpeed = 4,
}: {
  schedule: DockSchedule;
  title: string;
  // Tone keys hidden on load, e.g. "other,requested" (from admin settings).
  initialHidden?: string | null;
  interactive?: boolean;
  // Embedded inside the rotating board: the board's own header already shows
  // the location, clock and date, so this drops its full-page chrome and fills
  // the available space instead.
  embedded?: boolean;
  // Drift the table up and down like the board's other sections, at the same
  // speed the Settings slider sets.
  autoScroll?: boolean;
  scrollSpeed?: number;
}) {
  // Seeded from a prop, so the server and client agree on first paint.
  const [hidden, setHidden] = useState<Set<Tone>>(() => parseHidden(initialHidden ?? null));
  const now = useNow();

  const toggle = (tone: Tone) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(tone)) next.delete(tone);
      else next.add(tone);
      return next;
    });
  };

  const counts = useMemo(() => {
    const c = {} as Record<Tone, number>;
    for (const t of TONE_ORDER) c[t] = 0;
    for (const e of schedule.entries) c[e.tone as Tone]++;
    return c;
  }, [schedule.entries]);

  const visible = schedule.entries.filter((e) => !hidden.has(e.tone as Tone));

  return (
    <div
      className={
        embedded
          ? // Full-bleed inside the board's <main>, matching how the roster
            // sits there — no card, no border, no inset background.
            "flex min-h-0 flex-1 flex-col text-zinc-900 dark:text-zinc-100"
          : "flex min-h-screen flex-col bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100"
      }
    >
      {!embedded && (
        <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-white">
            {title}
            <span className="ml-3 text-xl font-normal text-zinc-500 dark:text-zinc-400">Dock Schedule</span>
          </h1>
          <div className="flex items-baseline gap-4 text-zinc-500 dark:text-zinc-400">
            <span className="text-lg">
              {new Date(`${schedule.date}T12:00:00`).toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </span>
            {now && (
              <span className="text-2xl font-semibold tabular-nums text-zinc-700 dark:text-zinc-200">
                {timeFmt.format(now)}
              </span>
            )}
          </div>
        </header>
      )}

      <div
        className={`flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-200 py-3 dark:border-zinc-800 ${
          embedded ? "px-0" : "px-6"
        }`}
      >
        {embedded && (
          <span className="mr-2 text-lg font-semibold text-zinc-900 dark:text-white">Dock Schedule</span>
        )}
        {TONE_ORDER.map((tone) => {
          const off = hidden.has(tone);
          return (
            <button
              key={tone}
              type="button"
              onClick={interactive ? () => toggle(tone) : undefined}
              disabled={!interactive}
              aria-pressed={!off}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                off
                  ? "bg-zinc-100 text-zinc-400 line-through dark:bg-zinc-900 dark:text-zinc-600"
                  : TONE_PILL[tone]
              } ${interactive ? "cursor-pointer hover:brightness-125" : "cursor-default"}`}
            >
              {TONE_LABEL[tone]}
              <span className="ml-2 opacity-70">{counts[tone]}</span>
            </button>
          );
        })}
        <span className="ml-auto text-sm text-zinc-500 dark:text-zinc-500">
          {visible.length} of {schedule.entries.length} shown
        </span>
      </div>

      {/* `zoom` (not transform: scale) so the table reflows within the panel
          instead of overflowing it. The filter bar above stays at 100% so the
          chips remain a predictable size. */}
      <main
        style={
          schedule.fontScale === 100 ? undefined : { zoom: schedule.fontScale / 100 }
        }
        className={`flex min-h-0 flex-1 flex-col py-4 ${
          embedded ? "px-0" : "px-6"
        } ${autoScroll ? "" : "overflow-y-auto"}`}
      >
        {!schedule.enabled ? (
          <p className="mt-10 text-center text-xl text-zinc-500 dark:text-zinc-400">
            Opendock isn&apos;t connected for this location yet.
          </p>
        ) : schedule.error ? (
          <p className="mt-10 text-center text-xl text-red-400">
            Couldn&apos;t reach Opendock: {schedule.error}
          </p>
        ) : schedule.entries.length === 0 ? (
          <p className="mt-10 text-center text-xl text-zinc-500 dark:text-zinc-400">
            No appointments scheduled today.
          </p>
        ) : visible.length === 0 ? (
          <p className="mt-10 text-center text-xl text-zinc-500 dark:text-zinc-400">
            Every appointment is hidden by the filters above.
          </p>
        ) : (
          // flex-1 + min-h-0 rather than h-full: inside the board's flex column
          // that resolves to the leftover space, which is what makes the
          // overflow — and therefore the scrolling — real.
          <AutoScroll
            enabled={autoScroll}
            speed={Math.max(1, Math.min(10, scrollSpeed)) * 0.1}
            maxHeightClass="min-h-0 flex-1"
          >
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-500">
                  <th className="px-3 py-2 font-medium">Time</th>
                  <th className="px-3 py-2 font-medium">Arrived</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 text-center font-medium">Door</th>
                  <th className="px-3 py-2 font-medium">Load type</th>
                  <th className="px-3 py-2 font-medium">Dir</th>
                  <th className="px-3 py-2 font-medium">PO / Ref #</th>
                  <th className="px-3 py-2 text-right font-medium">On time</th>
                  <th className="px-3 py-2 text-right font-medium">Dwell</th>
                  <th className="px-3 py-2 text-right font-medium">Processing</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((e) => {
                  const overdue = overdueMs(e, now);
                  const punctual = onTime(e.onTimeMs, overdue);
                  // Late on arrival, or still missing after its slot. Cancelled
                  // rows are excluded — a cancelled load is not "late".
                  const late =
                    e.tone !== "other" &&
                    (overdue !== null || (e.onTimeMs !== null && e.onTimeMs > 0));
                  return (
                    <tr
                      key={e.id}
                      className={`border-l-4 align-top text-lg ${
                        e.rejected
                          ? REJECTED_ROW
                          : late
                            ? LATE_ROW
                            : TONE_ROW[e.tone as Tone]
                      }`}
                    >
                      <td className="whitespace-nowrap px-3 py-3 font-semibold tabular-nums text-zinc-800 dark:text-zinc-200">
                        {clock(e.scheduledAt)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 tabular-nums text-zinc-600 dark:text-zinc-300">
                        {clock(e.arrivedAt)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {e.rejected && (
                            <span
                              className={`rounded-full px-3 py-1 text-sm font-bold uppercase tracking-wide ${REJECTED_PILL}`}
                            >
                              Rejected
                            </span>
                          )}
                          <span
                            className={`rounded-full px-3 py-1 text-sm font-semibold ${
                              TONE_PILL[e.tone as Tone]
                            }`}
                          >
                            {e.label}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center text-2xl font-bold leading-none text-zinc-900 dark:text-white">
                        {e.door ?? "—"}
                      </td>
                      <td className="px-3 py-3 text-zinc-700 dark:text-zinc-200">
                        {e.loadType ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-zinc-600 dark:text-zinc-300">
                        {e.direction ?? "—"}
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-mono text-base text-zinc-700 dark:text-zinc-300">
                          {e.poNumber ?? "—"}
                        </div>
                        {e.tags.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {e.tags.map((t, i) => (
                              <span
                                key={`${e.id}-tag-${i}`}
                                className="rounded bg-zinc-200 px-1.5 py-0.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td
                        className={`whitespace-nowrap px-3 py-3 text-right font-medium tabular-nums ${punctual.className}`}
                      >
                        {punctual.text}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-zinc-600 dark:text-zinc-300">
                        {duration(e.dwellMs)}
                        {e.dwellOpen && e.dwellMs !== null && (
                          <span className="ml-1 text-amber-500" title="Still on site">
                            ●
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-zinc-600 dark:text-zinc-300">
                        {duration(e.processingMs)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </AutoScroll>
        )}
      </main>
    </div>
  );
}
