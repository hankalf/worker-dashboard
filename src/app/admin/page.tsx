import { prisma } from "@/lib/prisma";
import { AdminDashboard } from "@/components/AdminDashboard";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const now = new Date();
  const [positions, employees, jobs, active, expired] = await Promise.all([
    prisma.position.findMany({ orderBy: [{ sortOrder: "asc" }, { title: "asc" }] }),
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
  ]);

  const toDto = (n: {
    id: string;
    message: string;
    expiresAt: Date | null;
    createdAt: Date;
  }) => ({
    id: n.id,
    message: n.message,
    expiresAt: n.expiresAt?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
  });

  return (
    <AdminDashboard
      positions={positions}
      employees={employees}
      jobs={jobs}
      notices={active.map(toDto)}
      expiredNotices={expired.map(toDto)}
    />
  );
}
