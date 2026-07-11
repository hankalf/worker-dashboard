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
    </div>
  );
}
