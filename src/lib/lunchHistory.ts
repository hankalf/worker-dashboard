import { prisma } from "@/lib/prisma";
import { easternDateKey } from "@/lib/time";

export type LunchInput = {
  id: string;
  name: string;
  lunchStart: string;
  shift: string | null;
};

// Sync today's lunch log to the current set of present employees who have a
// lunch scheduled. Names are snapshotted so the log survives renames. Rows for
// anyone no longer on today's list are dropped, so the log tracks the live plan.
// Idempotent and best-effort — never throws.
export async function recordLunchHistory(when: Date, lunches: LunchInput[]) {
  try {
    const date = easternDateKey(when);
    const ids = lunches.map((l) => l.id);
    await prisma.$transaction([
      prisma.lunchHistory.deleteMany({
        // notIn [] is invalid; use a sentinel so "nobody" clears the whole day.
        where: { date, employeeId: { notIn: ids.length ? ids : ["__none__"] } },
      }),
      ...lunches.map((l) =>
        prisma.lunchHistory.upsert({
          where: { date_employeeId: { date, employeeId: l.id } },
          update: { employeeName: l.name, lunchStart: l.lunchStart, shift: l.shift },
          create: {
            date,
            employeeId: l.id,
            employeeName: l.name,
            lunchStart: l.lunchStart,
            shift: l.shift,
          },
        })
      ),
    ]);
  } catch (e) {
    console.error("recordLunchHistory failed:", e);
  }
}

const RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

// Drop lunch history older than the 2-week retention window.
export async function purgeOldLunchHistory() {
  try {
    await prisma.lunchHistory.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - RETENTION_MS) } },
    });
  } catch (e) {
    console.error("purgeOldLunchHistory failed:", e);
  }
}
