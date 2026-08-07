"use client";

import { useMemo, useState } from "react";
import { APP_TZ } from "@/lib/time";
import { useNow } from "@/components/DashboardSections";
import type { DockSchedule, ScheduleEntry } from "@/lib/opendock";

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

// Row treatment per tone — high contrast, readable across a warehouse.
const TONE_ROW: Record<Tone, string> = {
  active: "border-l-blue-400 bg-blue-500/10",
  arrived: "border-l-amber-400 bg-amber-500/10",
  scheduled: "border-l-zinc-500 bg-transparent",
  requested: "border-l-zinc-700 bg-transparent",
  done: "border-l-green-500 bg-green-500/5 opacity-60",
  other: "border-l-zinc-700 bg-transparent opacity-50",
};

const TONE_PILL: Record<Tone, string> = {
  active: "bg-blue-500/25 text-blue-200",
  arrived: "bg-amber-500/25 text-amber-200",
  scheduled: "bg-zinc-700 text-zinc-200",
  requested: "bg-zinc-800 text-zinc-400",
  done: "bg-green-500/20 text-green-300",
  other: "bg-zinc-800 text-zinc-400",
};

const timeFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TZ,
  hour: "numeric",
  minute: "2-digit",
});

function timeRange(entry: ScheduleEntry): string {
  if (!entry.start) return "—";
  const start = timeFmt.format(new Date(entry.start));
  if (!entry.end) return start;
  return `${start} – ${timeFmt.format(new Date(entry.end))}`;
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
          ? "flex min-h-0 flex-1 flex-col rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-100"
          : "flex min-h-screen flex-col bg-zinc-950 text-zinc-100"
      }
    >
      {!embedded && (
        <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b border-zinc-800 px-6 py-4">
          <h1 className="text-3xl font-bold text-white">
            {title}
            <span className="ml-3 text-xl font-normal text-zinc-400">Dock Schedule</span>
          </h1>
          <div className="flex items-baseline gap-4 text-zinc-400">
            <span className="text-lg">
              {new Date(`${schedule.date}T12:00:00`).toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </span>
            {now && (
              <span className="text-2xl font-semibold tabular-nums text-zinc-200">
                {timeFmt.format(now)}
              </span>
            )}
          </div>
        </header>
      )}

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-800 px-6 py-3">
        {embedded && (
          <span className="mr-2 text-lg font-semibold text-white">Dock Schedule</span>
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
                  ? "bg-zinc-900 text-zinc-600 line-through"
                  : TONE_PILL[tone]
              } ${interactive ? "cursor-pointer hover:brightness-125" : "cursor-default"}`}
            >
              {TONE_LABEL[tone]}
              <span className="ml-2 opacity-70">{counts[tone]}</span>
            </button>
          );
        })}
        <span className="ml-auto text-sm text-zinc-500">
          {visible.length} of {schedule.entries.length} shown
        </span>
      </div>

      <main className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        {!schedule.enabled ? (
          <p className="mt-10 text-center text-xl text-zinc-500">
            Opendock isn&apos;t connected for this location yet.
          </p>
        ) : schedule.error ? (
          <p className="mt-10 text-center text-xl text-red-400">
            Couldn&apos;t reach Opendock: {schedule.error}
          </p>
        ) : schedule.entries.length === 0 ? (
          <p className="mt-10 text-center text-xl text-zinc-500">
            No appointments scheduled today.
          </p>
        ) : visible.length === 0 ? (
          <p className="mt-10 text-center text-xl text-zinc-500">
            Every appointment is hidden by the filters above.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {visible.map((e) => (
              <li
                key={e.id}
                className={`grid grid-cols-[6rem_11rem_1fr_auto] items-center gap-4 rounded-r-lg border-l-4 px-4 py-3 ${
                  TONE_ROW[e.tone as Tone]
                }`}
              >
                <div className="text-center">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500">
                    Door
                  </div>
                  <div className="text-3xl font-bold leading-tight text-white">
                    {e.door ?? "—"}
                  </div>
                </div>

                <div className="text-xl font-semibold tabular-nums text-zinc-200">
                  {timeRange(e)}
                </div>

                <div className="min-w-0">
                  <div className="truncate text-lg text-white">
                    {e.customer ?? "—"}
                    {e.refNumber && (
                      <span className="ml-2 font-mono text-sm text-zinc-400">
                        {e.refNumber}
                      </span>
                    )}
                  </div>
                  {e.people.length > 0 && (
                    <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-sm">
                      {e.people.map((p, i) => (
                        <span
                          key={`${e.id}-${p.role}-${p.name}-${i}`}
                          className={p.matched ? "text-zinc-300" : "text-zinc-500"}
                        >
                          <span className="text-zinc-500">{p.role}:</span> {p.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <span
                  className={`whitespace-nowrap rounded-full px-3 py-1 text-base font-semibold ${
                    TONE_PILL[e.tone as Tone]
                  }`}
                >
                  {e.label}
                </span>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
