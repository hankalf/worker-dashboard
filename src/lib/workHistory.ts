import { prisma } from "@/lib/prisma";
import { easternDateKey } from "@/lib/time";

// Record that an employee worked a position on the current Eastern day. Name and
// title are snapshotted so the history reads correctly even after later renames.
// Idempotent per (date, employee, position). Best-effort — never throws.
export async function recordWorkHistory(
  employeeId: string,
  employeeName: string,
  positionId: string,
  positionTitle: string,
  when: Date = new Date()
) {
  try {
    const date = easternDateKey(when);
    await prisma.workHistory.upsert({
      where: {
        date_employeeId_positionId: { date, employeeId, positionId },
      },
      update: { employeeName, positionTitle },
      create: { date, employeeId, employeeName, positionId, positionTitle },
    });
  } catch (e) {
    console.error("recordWorkHistory failed:", e);
  }
}

const RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

// Drop work history older than the 2-week retention window.
export async function purgeOldWorkHistory() {
  try {
    await prisma.workHistory.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - RETENTION_MS) } },
    });
  } catch (e) {
    console.error("purgeOldWorkHistory failed:", e);
  }
}
