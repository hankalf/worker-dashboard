import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DashboardView } from "@/components/DashboardView";
import { splitNotices } from "@/lib/announcements";
import { getDashboardName, getRotationConfig } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ tv?: string }>;
}) {
  const session = await auth();
  const tv = (await searchParams).tv === "1";

  const now = new Date();
  const [positions, employees, jobs, activeNotices, dashboardName] =
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
    // Notices that are live now — started and not expired — oldest first;
    // splitNotices picks the visible set (pinned always shown, then unpinned
    // up to the cap). Scheduled notices (future startsAt) stay off the board
    // until their time (auto-refresh re-queries and shows them).
    prisma.announcement.findMany({
      where: {
        AND: [
          { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        ],
      },
      orderBy: { createdAt: "asc" },
    }),
    getDashboardName(),
  ]);

  const rotation = await getRotationConfig();

  const { visible } = splitNotices(activeNotices);

  return (
    <DashboardView
      positions={positions}
      employees={employees}
      jobs={jobs}
      isAdmin={!!session?.user}
      announcements={visible.map((n) => n.message)}
      renderedAt={now.toISOString()}
      title={dashboardName}
      rotatingUrl={rotation.url}
      rotationSeconds={rotation.seconds}
      rotatingEnabled={rotation.enabled}
      tv={tv}
    />
  );
}
