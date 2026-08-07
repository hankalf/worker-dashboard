import { prisma } from "@/lib/prisma";
import { easternDateKey } from "@/lib/time";

// Daily per-employee attendance. HeadcountSnapshot only keeps totals, so this
// is what makes "who is out most often" answerable. Name and shift are
// snapshotted so the history still reads correctly after later edits.
//
// Written by the same throttled block on the admin dashboard that already
// records work and lunch history, and idempotent per (date, employee) — the
// last state seen for the day wins, so someone marked absent and later marked
// present ends the day as present.
export async function recordAttendance(
  when: Date,
  people: { id: string; name: string; shift: string | null; status: string }[]
) {
  if (people.length === 0) return;
  try {
    const date = easternDateKey(when);
    await prisma.$transaction(
      people.map((p) =>
        prisma.attendanceHistory.upsert({
          where: { date_employeeId: { date, employeeId: p.id } },
          update: { employeeName: p.name, shift: p.shift, status: p.status },
          create: {
            date,
            employeeId: p.id,
            employeeName: p.name,
            shift: p.shift,
            status: p.status,
          },
        })
      )
    );
  } catch (e) {
    console.error("recordAttendance failed:", e);
  }
}

// Kept longer than work history (2 weeks): absence patterns are only meaningful
// over months, and a row per person per day is small.
const RETENTION_MS = 120 * 24 * 60 * 60 * 1000;

export async function purgeOldAttendance() {
  try {
    await prisma.attendanceHistory.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - RETENTION_MS) } },
    });
  } catch (e) {
    console.error("purgeOldAttendance failed:", e);
  }
}
