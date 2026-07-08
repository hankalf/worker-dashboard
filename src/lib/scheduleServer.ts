import { prisma } from "@/lib/prisma";
import { easternDateKey } from "@/lib/time";

// Server-only half of advance scheduling (imports Prisma — never import this
// from a client component; the pure date helpers live in @/lib/schedule).

const SCHEDULE_APPLIED_KEY = "scheduleAppliedDate";

// Once per day, on the first board/dashboard load after midnight, push any plan
// for today onto the live board, then purge past-date plans. Idempotent and
// self-guarded via a Setting so same-day live edits are never re-overwritten.
export async function applyDueSchedules(now = new Date()): Promise<void> {
  const today = easternDateKey(now);
  try {
    const applied = await prisma.setting.findUnique({
      where: { key: SCHEDULE_APPLIED_KEY },
    });
    if (applied?.value !== today) {
      const due = await prisma.scheduledAssignment.findMany({
        where: { date: today },
      });
      for (const s of due) {
        await prisma.employee
          .update({
            where: { id: s.employeeId },
            data: { positionId: s.positionId },
          })
          .catch(() => {
            // employee removed since planning — skip
          });
      }
      await prisma.setting.upsert({
        where: { key: SCHEDULE_APPLIED_KEY },
        update: { value: today },
        create: { key: SCHEDULE_APPLIED_KEY, value: today },
      });
    }
    // Clean up plans whose date has passed (today's stay until tomorrow).
    await prisma.scheduledAssignment.deleteMany({
      where: { date: { lt: today } },
    });
  } catch {
    // Table not present yet (pre-migration) — no-op.
  }
}
