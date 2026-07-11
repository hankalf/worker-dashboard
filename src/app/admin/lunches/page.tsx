import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/rbac";
import { easternDateKey } from "@/lib/time";
import { SHIFTS, type ShiftKey } from "@/lib/shift";
import { recordLunchHistory, purgeOldLunchHistory } from "@/lib/lunchHistory";
import { LunchesView, type TodayLunch } from "@/components/LunchesView";

export const dynamic = "force-dynamic";

// "2026-07-04" -> "Sat, Jul 4" (kept in UTC so the calendar day doesn't shift).
function formatDate(date: string) {
  return new Date(date + "T12:00:00Z").toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

const shiftLabel = (s: string | null) =>
  s && s in SHIFTS ? SHIFTS[s as ShiftKey].label : "";

export default async function LunchesPage() {
  // Staff (admins + supervisors) — the same people who set lunches on Assign.
  if (!(await requireStaff())) redirect("/login");

  const now = new Date();
  const today = easternDateKey(now);

  const employees = await prisma.employee.findMany({
    where: { terminatedAt: null, accessLevel: { not: "ADMIN" } },
    include: { position: true },
    orderBy: { name: "asc" },
  });

  // Today's live lunches: present employees who have a lunch scheduled.
  const todays: TodayLunch[] = employees
    .filter((e) => e.attendance === "PRESENT" && e.lunchStart)
    .map((e) => ({
      id: e.id,
      name: e.name,
      lunchStart: e.lunchStart!,
      position: e.position?.title ?? null,
      shift: e.shift,
    }));

  // Log today's lunches and prune anything past the 2-week window (best-effort).
  await recordLunchHistory(
    now,
    todays.map((l) => ({ id: l.id, name: l.name, lunchStart: l.lunchStart, shift: l.shift }))
  );
  await purgeOldLunchHistory();

  // History: every logged day, most recent first. Today is shown live above.
  const rows = await prisma.lunchHistory.findMany({
    orderBy: [{ date: "desc" }, { lunchStart: "asc" }],
    take: 1000,
  });
  const byDate = new Map<string, typeof rows>();
  for (const r of rows) {
    if (r.date === today) continue;
    const list = byDate.get(r.date);
    if (list) list.push(r);
    else byDate.set(r.date, [r]);
  }
  const historyDates = [...byDate.keys()].sort().reverse().slice(0, 14);

  return (
    <div>
      <h2 className="text-lg font-semibold text-white">Lunches</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Today&apos;s lunches update live. Past days are logged and kept for two
        weeks, recorded while the Lunches or Admin Dashboard tab is open.
      </p>

      <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <LunchesView todays={todays} />
      </div>

      <h3 className="mt-8 text-sm font-semibold uppercase tracking-wide text-zinc-400">
        Lunch history
      </h3>
      {historyDates.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">
          No past lunch days logged yet.
        </p>
      ) : (
        <div className="mt-3 space-y-4">
          {historyDates.map((date) => {
            const list = byDate.get(date)!;
            return (
              <div
                key={date}
                className="overflow-hidden rounded-lg border border-zinc-800"
              >
                <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900 px-4 py-2">
                  <span className="text-sm font-medium text-zinc-200">
                    {formatDate(date)}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {list.length} lunch{list.length === 1 ? "" : "es"}
                  </span>
                </div>
                <ul className="divide-y divide-zinc-800/60">
                  {list.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center justify-between gap-3 px-4 py-1.5"
                    >
                      <span className="flex min-w-0 items-baseline gap-2">
                        <span className="w-20 shrink-0 text-sm font-semibold tabular-nums text-teal-300">
                          {formatClock(r.lunchStart)}
                        </span>
                        <span className="truncate text-sm text-zinc-200">
                          {r.employeeName}
                        </span>
                      </span>
                      {shiftLabel(r.shift) && (
                        <span className="shrink-0 rounded-full bg-blue-950 px-2 py-0.5 text-xs text-blue-300">
                          {shiftLabel(r.shift)}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Server-side 12-hour clock formatter (mirrors the client one) for history rows.
function formatClock(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
