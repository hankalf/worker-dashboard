import { prisma } from "@/lib/prisma";
import { AdminDashboard } from "@/components/AdminDashboard";
import { currentShift } from "@/lib/shift";
import { easternDateKey } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const now = new Date();

  // Tidy up notices that expired more than a week ago.
  await prisma.announcement.deleteMany({
    where: { expiresAt: { lt: new Date(now.getTime() - 7 * 24 * 3600 * 1000) } },
  });

  const [positions, employees, jobs, active, expired, shiftNotes] =
    await Promise.all([
      prisma.position.findMany({
        orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
      }),
      prisma.employee.findMany({
        where: { terminatedAt: null },
        include: { position: true, roles: true },
        orderBy: { name: "asc" },
      }),
      prisma.job.findMany({
        include: { assignedEmployee: { include: { position: true } } },
        orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      }),
      // Active notices (live + queued), oldest first.
      prisma.announcement.findMany({
        where: { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        orderBy: { createdAt: "asc" },
      }),
      // The most recently expired notices, so admins can see what dropped off.
      prisma.announcement.findMany({
        where: { expiresAt: { lte: now } },
        orderBy: { expiresAt: "desc" },
        take: 10,
      }),
      prisma.shiftNote.findMany(),
    ]);

  // Lazy attendance-history snapshot: record the current shift's headcount,
  // throttled to at most once every 2 minutes so the 15s auto-refresh doesn't
  // hammer the DB. Best-effort — never let it break the dashboard.
  try {
    const shiftKey = currentShift(now);
    const dateKey = easternDateKey(now);
    const roster = employees.filter(
      (e) => e.shift === null || e.shift === shiftKey
    );
    const present = roster.filter((e) => e.attendance === "PRESENT").length;
    const existing = await prisma.headcountSnapshot.findUnique({
      where: { date_shift: { date: dateKey, shift: shiftKey } },
    });
    if (!existing || now.getTime() - existing.updatedAt.getTime() > 120_000) {
      await prisma.headcountSnapshot.upsert({
        where: { date_shift: { date: dateKey, shift: shiftKey } },
        update: { present, total: roster.length },
        create: { date: dateKey, shift: shiftKey, present, total: roster.length },
      });
    }
  } catch (e) {
    console.error("headcount snapshot failed:", e);
  }

  const toDto = (n: {
    id: string;
    message: string;
    expiresAt: Date | null;
    pinned: boolean;
    createdAt: Date;
  }) => ({
    id: n.id,
    message: n.message,
    expiresAt: n.expiresAt?.toISOString() ?? null,
    pinned: n.pinned,
    createdAt: n.createdAt.toISOString(),
  });

  return (
    <AdminDashboard
      positions={positions}
      employees={employees}
      jobs={jobs}
      notices={active.map(toDto)}
      expiredNotices={expired.map(toDto)}
      shiftNotes={shiftNotes.map((n) => ({
        id: n.id,
        message: n.message,
        updatedByName: n.updatedByName,
        updatedAt: n.updatedAt.toISOString(),
      }))}
    />
  );
}
