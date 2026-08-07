import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSupervisor } from "@/lib/rbac";
import { SHIFTS, type ShiftKey } from "@/lib/shift";

export const dynamic = "force-dynamic";

const SHIFT_ORDER: ShiftKey[] = ["FIRST", "SECOND", "THIRD"];

// "2026-07-04" -> "Sat, Jul 4" (kept in UTC so the calendar day doesn't shift).
function formatDate(date: string) {
  return new Date(date + "T12:00:00Z").toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

// Absences over the trailing window, and how coverage varies by weekday.
const PATTERN_DAYS = 30;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ABSENT_STATUSES = new Set(["ABSENT", "CALLED_OUT", "PTO"]);
const STATUS_LABEL: Record<string, string> = {
  ABSENT: "Absent",
  CALLED_OUT: "Called out",
  PTO: "PTO",
};

export default async function AttendanceHistoryPage() {
  // Supervisor+ — leads and below are sent to the admin dashboard.
  if (!(await requireSupervisor())) redirect("/admin");

  const snaps = await prisma.headcountSnapshot.findMany({
    orderBy: [{ date: "desc" }, { shift: "asc" }],
    take: 200,
  });

  const byDate = new Map<
    string,
    Record<string, { present: number; total: number }>
  >();
  for (const s of snaps) {
    if (!byDate.has(s.date)) byDate.set(s.date, {});
    byDate.get(s.date)![s.shift] = { present: s.present, total: s.total };
  }
  const dates = [...byDate.keys()].sort().reverse().slice(0, 14);

  // Trend chart: present counts per shift over the visible days (oldest left).
  const chartDates = [...dates].reverse();
  const SHIFT_COLORS: Record<ShiftKey, string> = {
    FIRST: "#60a5fa",
    SECOND: "#a78bfa",
    THIRD: "#fbbf24",
  };
  const maxPresent = Math.max(
    1,
    ...chartDates.flatMap((d) =>
      SHIFT_ORDER.map((s) => byDate.get(d)?.[s]?.present ?? 0)
    )
  );
  const W = 720;
  const H = 200;
  const padL = 26;
  const padR = 8;
  const padT = 12;
  const padB = 24;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const groupW = plotW / Math.max(chartDates.length, 1);
  const barW = groupW / 4;

  // --- Patterns -----------------------------------------------------------
  // Coverage by weekday, from the same snapshots as the chart above.
  const weekdayTotals = WEEKDAYS.map(() => ({ present: 0, total: 0, days: 0 }));
  for (const [date, shifts] of byDate) {
    const dow = new Date(date + "T12:00:00Z").getUTCDay();
    const present = Object.values(shifts).reduce((n, v) => n + v.present, 0);
    const total = Object.values(shifts).reduce((n, v) => n + v.total, 0);
    if (total === 0) continue;
    weekdayTotals[dow].present += present;
    weekdayTotals[dow].total += total;
    weekdayTotals[dow].days += 1;
  }
  const weekdayRates = weekdayTotals
    .map((w, i) => ({
      day: WEEKDAYS[i],
      days: w.days,
      rate: w.total > 0 ? Math.round((w.present / w.total) * 100) : null,
    }))
    .filter((w) => w.days > 0);

  // Who is out most often, from the per-employee daily record.
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - PATTERN_DAYS);
  const cutoffKey = cutoff.toISOString().slice(0, 10);
  const attendance = await prisma.attendanceHistory.findMany({
    where: { date: { gte: cutoffKey } },
    select: { employeeId: true, employeeName: true, status: true, date: true },
  });

  const perPerson = new Map<
    string,
    { name: string; days: number; out: number; breakdown: Record<string, number> }
  >();
  for (const row of attendance) {
    const cur =
      perPerson.get(row.employeeId) ??
      { name: row.employeeName, days: 0, out: 0, breakdown: {} };
    cur.name = row.employeeName;
    cur.days += 1;
    if (ABSENT_STATUSES.has(row.status)) {
      cur.out += 1;
      cur.breakdown[row.status] = (cur.breakdown[row.status] ?? 0) + 1;
    }
    perPerson.set(row.employeeId, cur);
  }
  const absences = [...perPerson.entries()]
    .map(([id, v]) => ({ id, ...v }))
    .filter((p) => p.out > 0)
    .sort((a, b) => b.out - a.out || a.name.localeCompare(b.name))
    .slice(0, 12);
  const trackedDays = new Set(attendance.map((a) => a.date)).size;

  return (
    <div>
      <h2 className="text-lg font-semibold text-white">Attendance history</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Present / on-shift headcount, recorded per shift while the admin
        dashboard is open. Shifts with no admin viewing won&apos;t have a record.
      </p>

      {dates.length === 0 ? (
        <p className="mt-6 text-sm text-zinc-500">
          No attendance history recorded yet.
        </p>
      ) : (
        <>
        <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400">
            <span className="font-medium uppercase tracking-wide">
              Present by day
            </span>
            {SHIFT_ORDER.map((s) => (
              <span key={s} className="flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: SHIFT_COLORS[s] }}
                />
                {SHIFTS[s].label}
              </span>
            ))}
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img">
            {/* baseline + max gridline */}
            <line x1={padL} y1={padT} x2={W - padR} y2={padT} stroke="#27272a" strokeDasharray="2 2" />
            <line x1={padL} y1={padT + plotH} x2={W - padR} y2={padT + plotH} stroke="#3f3f46" />
            <text x={padL - 4} y={padT + 4} textAnchor="end" fontSize="9" fill="#71717a">{maxPresent}</text>
            <text x={padL - 4} y={padT + plotH} textAnchor="end" fontSize="9" fill="#71717a">0</text>
            {chartDates.map((date, i) =>
              SHIFT_ORDER.map((shift, j) => {
                const cell = byDate.get(date)?.[shift];
                if (!cell) return null;
                const bh = (cell.present / maxPresent) * plotH;
                const x = padL + i * groupW + j * barW + barW * 0.3;
                const y = padT + plotH - bh;
                return (
                  <rect key={date + shift} x={x} y={y} width={barW * 0.8} height={Math.max(bh, 0)} fill={SHIFT_COLORS[shift]} rx={1}>
                    <title>{`${formatDate(date)} · ${SHIFTS[shift].label}: ${cell.present}/${cell.total}`}</title>
                  </rect>
                );
              })
            )}
            {chartDates.map((date, i) => (
              <text key={date} x={padL + i * groupW + groupW / 2} y={H - 8} textAnchor="middle" fontSize="9" fill="#71717a">
                {Number(date.slice(8))}
              </text>
            ))}
          </svg>
        </div>

        <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900 text-left text-xs uppercase tracking-wide text-zinc-400">
                <th className="px-4 py-2 font-medium">Date</th>
                {SHIFT_ORDER.map((s) => (
                  <th key={s} className="px-4 py-2 font-medium">
                    {SHIFTS[s].label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dates.map((date) => (
                <tr key={date} className="border-b border-zinc-800/60">
                  <td className="whitespace-nowrap px-4 py-2 text-zinc-300">
                    {formatDate(date)}
                  </td>
                  {SHIFT_ORDER.map((s) => {
                    const cell = byDate.get(date)?.[s];
                    if (!cell) {
                      return (
                        <td key={s} className="px-4 py-2 text-zinc-600">
                          —
                        </td>
                      );
                    }
                    const pct =
                      cell.total > 0
                        ? Math.round((cell.present / cell.total) * 100)
                        : 0;
                    const low = cell.total > 0 && cell.present / cell.total < 0.5;
                    return (
                      <td key={s} className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <span className="tabular-nums text-zinc-200">
                            {cell.present}/{cell.total}
                          </span>
                          <span className="h-1.5 w-16 overflow-hidden rounded-full bg-zinc-800">
                            <span
                              className={`block h-full ${
                                low ? "bg-red-500" : "bg-emerald-500"
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <h3 className="text-sm font-medium text-white">Coverage by weekday</h3>
          <p className="mt-1 text-xs text-zinc-500">
            Share of the on-shift roster that showed up, averaged over every
            recorded day.
          </p>
          {weekdayRates.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-500">Not enough history yet.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {weekdayRates.map((w) => (
                <li key={w.day} className="flex items-center gap-3 text-sm">
                  <span className="w-10 shrink-0 text-zinc-400">{w.day}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-800">
                    <span
                      className={`block h-full ${
                        (w.rate ?? 0) < 80 ? "bg-red-500" : "bg-emerald-500"
                      }`}
                      style={{ width: `${w.rate ?? 0}%` }}
                    />
                  </span>
                  <span className="w-16 shrink-0 text-right tabular-nums text-zinc-300">
                    {w.rate}%
                  </span>
                  <span className="w-16 shrink-0 text-right text-xs text-zinc-600">
                    {w.days}d
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <h3 className="text-sm font-medium text-white">
            Most days out — last {PATTERN_DAYS} days
          </h3>
          <p className="mt-1 text-xs text-zinc-500">
            Absent, called out or PTO, per person.
            {trackedDays > 0 ? ` ${trackedDays} day(s) recorded.` : ""}
          </p>
          {absences.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-500">
              {trackedDays === 0
                ? "No per-employee history recorded yet — this fills in from today."
                : "Nobody has missed a day in this window."}
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {absences.map((p) => (
                <li key={p.id} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate text-zinc-200">{p.name}</span>
                  <span className="shrink-0 text-xs text-zinc-500">
                    {Object.entries(p.breakdown)
                      .map(([k, n]) => `${STATUS_LABEL[k] ?? k} ${n}`)
                      .join(" · ")}
                  </span>
                  <span className="w-20 shrink-0 text-right tabular-nums text-zinc-300">
                    {p.out} / {p.days}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
