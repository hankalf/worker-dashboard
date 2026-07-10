import { prisma } from "@/lib/prisma";
import { AdminDashboard } from "@/components/AdminDashboard";
import { currentShift } from "@/lib/shift";
import { easternDateKey } from "@/lib/time";
import { recordWorkHistory, purgeOldWorkHistory } from "@/lib/workHistory";
import { getBranding } from "@/lib/settings";
import { getActiveLaborShare } from "@/lib/laborShareServer";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const now = new Date();

  const [positions, employees, jobs, capabilities, active] =
    await Promise.all([
    prisma.position.findMany({
      orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    }),
    prisma.employee.findMany({
      where: { terminatedAt: null },
      include: {
        position: true,
        roles: true,
        capabilities: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
      },
      orderBy: { name: "asc" },
    }),
    prisma.job.findMany({
      include: { assignedEmployee: { include: { position: true } } },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    }),
    prisma.capability.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    // Active notices (live + queued), oldest first — for the board mirror.
    prisma.announcement.findMany({
      where: { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      orderBy: { createdAt: "asc" },
    }),
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

      // Record what position each present employee worked today, then prune
      // work history older than the 2-week window.
      await Promise.all(
        employees
          .filter((e) => e.attendance === "PRESENT" && e.position)
          .map((e) =>
            recordWorkHistory(e.id, e.name, e.positionId!, e.position!.title, now)
          )
      );
      await purgeOldWorkHistory();
    }
  } catch (e) {
    console.error("snapshot failed:", e);
  }

  const toDto = (n: {
    id: string;
    message: string;
    startsAt: Date | null;
    expiresAt: Date | null;
    pinned: boolean;
    createdAt: Date;
  }) => ({
    id: n.id,
    message: n.message,
    startsAt: n.startsAt?.toISOString() ?? null,
    expiresAt: n.expiresAt?.toISOString() ?? null,
    pinned: n.pinned,
    createdAt: n.createdAt.toISOString(),
  });

  const branding = await getBranding();
  const laborShare = await getActiveLaborShare(now);

  return (
    <AdminDashboard
      positions={positions}
      employees={employees}
      jobs={jobs}
      capabilities={capabilities}
      notices={active.map(toDto)}
      branding={branding}
      laborShare={laborShare}
    />
  );
}
