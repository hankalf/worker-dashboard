import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/rbac";
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
  // Admin-only: supervisors are sent back to their assign board.
  if (!(await requireAdmin())) redirect("/admin/assign");

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
      )}
    </div>
  );
}
