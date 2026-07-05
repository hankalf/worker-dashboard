import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DashboardView } from "@/components/DashboardView";
import { MAX_VISIBLE_NOTICES } from "@/lib/announcements";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ tv?: string }>;
}) {
  const session = await auth();
  const tv = (await searchParams).tv === "1";

  const now = new Date();
  const [positions, employees, jobs, notices] = await Promise.all([
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
    // Up to 5 active notices, oldest first; the rest stay queued until one
    // expires (auto-refresh re-queries and promotes the next in line).
    prisma.announcement.findMany({
      where: { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      orderBy: { createdAt: "asc" },
      take: MAX_VISIBLE_NOTICES,
    }),
  ]);

  return (
    <DashboardView
      positions={positions}
      employees={employees}
      jobs={jobs}
      isAdmin={!!session?.user}
      announcements={notices.map((n) => n.message)}
      tv={tv}
    />
  );
}
