"use client";

import { useNow, useAutoRefresh, formatClock } from "@/components/DashboardSections";
import { appMinutes } from "@/lib/time";
import { SHIFTS, type ShiftKey } from "@/lib/shift";

export type TodayLunch = {
  id: string;
  name: string;
  lunchStart: string; // "HH:MM"
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

// The live top section of the Lunches tab: who's on lunch right now, and the
// full lunch schedule for today. Ticks with the clock so "On lunch" updates and
// soft-refreshes so admin edits on the Assign board show up.
export function LunchesView({ todays }: { todays: TodayLunch[] }) {
  const now = useNow();
  useAutoRefresh();

  const schedule = [...todays].sort(
    (a, b) => toMin(a.lunchStart) - toMin(b.lunchStart)
  );
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

      {/* Today's lunch schedule */}
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
            {schedule.map((l) => (
              <li
                key={l.id}
                className="flex items-center justify-between gap-3 px-4 py-2"
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
                  {l.position && <span className="truncate">{l.position}</span>}
                  {shiftLabel(l.shift) && (
                    <span className="rounded-full bg-blue-950 px-2 py-0.5 text-blue-300">
                      {shiftLabel(l.shift)}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
