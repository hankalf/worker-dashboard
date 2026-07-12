"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useNow, useAutoRefresh, formatClock } from "@/components/DashboardSections";
import { appMinutes } from "@/lib/time";
import { SHIFTS, type ShiftKey } from "@/lib/shift";

export type TodayLunch = {
  id: string;
  name: string;
  lunchStart: string; // "HH:MM"
  breakStart: string | null; // "HH:MM"
  position: string | null;
  shift: string | null;
};

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

// Lunch is always 30 minutes — the time they're back.
const backAt = (start: string) => {
  const t = toMin(start) + 30;
  const hh = String(Math.floor(t / 60) % 24).padStart(2, "0");
  const mm = String(t % 60).padStart(2, "0");
  return formatClock(`${hh}:${mm}`);
};

const shiftLabel = (s: string | null) =>
  s && s in SHIFTS ? SHIFTS[s as ShiftKey].label : "";

// Selectable times in 15-minute steps across the day (matches the Assign board).
const TIMES = Array.from({ length: 96 }, (_, i) => {
  const h = Math.floor(i / 4);
  const m = (i % 4) * 15;
  const value = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  return { value, label: formatClock(value) };
});

const timeSelectClass =
  "min-w-0 flex-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100";

// The live top section of the Lunches tab: who's on lunch right now, and the
// full lunch schedule for today. Ticks with the clock so "On lunch" updates and
// soft-refreshes so Assign-board edits show up. Rows in the schedule can be
// clicked to adjust that employee's lunch and break times inline.
export function LunchesView({ todays }: { todays: TodayLunch[] }) {
  const now = useNow();
  useAutoRefresh();
  const router = useRouter();

  // Local editable copy so edits show immediately; re-synced when the server
  // data refreshes.
  const [rows, setRows] = useState<TodayLunch[]>(todays);
  useEffect(() => setRows(todays), [todays]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const save = async (id: string, data: Record<string, string>) => {
    setBusyId(id);
    try {
      await fetch(`/api/employees/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  };

  const setLunch = (id: string, value: string) => {
    setRows((rs) =>
      rs.map((r) => (r.id === id ? { ...r, lunchStart: value } : r))
    );
    // Lunch is always 30 min; store the start and clear any explicit end.
    save(id, { lunchStart: value, lunchEnd: "" });
  };
  const setBreak = (id: string, value: string) => {
    setRows((rs) =>
      rs.map((r) => (r.id === id ? { ...r, breakStart: value || null } : r))
    );
    save(id, { breakStart: value });
  };

  // Only employees who still have a lunch time appear in the schedule.
  const schedule = rows
    .filter((r) => r.lunchStart)
    .sort((a, b) => toMin(a.lunchStart) - toMin(b.lunchStart));
  const cur = now ? appMinutes(now) : -1;
  const onLunch =
    cur < 0
      ? []
      : schedule.filter((l) => {
          const s = toMin(l.lunchStart);
          return cur >= s && cur < s + 30;
        });

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {/* On lunch now */}
      <section>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">
          On Lunch{onLunch.length > 0 ? ` (${onLunch.length})` : ""}
        </h3>
        {onLunch.length === 0 ? (
          <div className="flex h-[9.5rem] items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-sm text-zinc-500">
            No one is on lunch right now.
          </div>
        ) : (
          <ul className="max-h-72 divide-y divide-zinc-800 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900">
            {onLunch.map((l) => (
              <li
                key={l.id}
                className="flex items-center justify-between gap-3 px-4 py-2"
              >
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="w-20 shrink-0 text-sm font-semibold tabular-nums text-amber-300">
                    {backAt(l.lunchStart)}
                  </span>
                  <span className="truncate text-sm font-medium text-zinc-100">
                    {l.name}
                  </span>
                </span>
                {l.position && (
                  <span className="shrink-0 truncate text-xs text-zinc-500">
                    {l.position}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Today's lunch schedule — click a row to edit lunch & break times */}
      <section>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">
          Today&apos;s Lunch Schedule{schedule.length > 0 ? ` (${schedule.length})` : ""}
        </h3>
        {schedule.length === 0 ? (
          <div className="flex h-[9.5rem] items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-sm text-zinc-500">
            No lunches scheduled today.
          </div>
        ) : (
          <ul className="max-h-72 divide-y divide-zinc-800 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900">
            {schedule.map((l) => {
              const open = editingId === l.id;
              return (
                <li key={l.id} className="px-2 py-1">
                  <button
                    type="button"
                    onClick={() => setEditingId(open ? null : l.id)}
                    aria-expanded={open}
                    className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1 text-left hover:bg-zinc-800/60"
                  >
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span className="w-20 shrink-0 text-sm font-semibold tabular-nums text-teal-300">
                        {formatClock(l.lunchStart)}
                      </span>
                      <span className="truncate text-sm font-medium text-zinc-100">
                        {l.name}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2 text-xs text-zinc-500">
                      {busyId === l.id && <span className="text-zinc-500">…</span>}
                      {l.position && <span className="truncate">{l.position}</span>}
                      {shiftLabel(l.shift) && (
                        <span className="rounded-full bg-blue-950 px-2 py-0.5 text-blue-300">
                          {shiftLabel(l.shift)}
                        </span>
                      )}
                    </span>
                  </button>

                  {open && (
                    <div className="flex flex-col gap-2 px-2 pb-2 pt-1 text-xs text-zinc-400">
                      <label className="flex items-center gap-2">
                        <span className="w-12 shrink-0 text-zinc-500">Lunch</span>
                        <select
                          value={l.lunchStart}
                          onChange={(e) => setLunch(l.id, e.target.value)}
                          style={{ colorScheme: "dark" }}
                          className={timeSelectClass}
                        >
                          <option value="">None</option>
                          {TIMES.map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex items-center gap-2">
                        <span className="w-12 shrink-0 text-zinc-500">Break</span>
                        <select
                          value={l.breakStart ?? ""}
                          onChange={(e) => setBreak(l.id, e.target.value)}
                          style={{ colorScheme: "dark" }}
                          className={timeSelectClass}
                        >
                          <option value="">None</option>
                          {TIMES.map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
