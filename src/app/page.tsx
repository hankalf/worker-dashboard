import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DashboardView } from "@/components/DashboardView";
import { splitNotices } from "@/lib/announcements";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ tv?: string }>;
}) {
  const session = await auth();
  const tv = (await searchParams).tv === "1";

  const now = new Date();
  const [positions, employees, jobs, activeNotices, shiftNotes] =
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
      // All active notices, oldest first; splitNotices picks the visible set
      // (pinned always shown, then unpinned up to the cap). The rest stay
      // queued until one expires (auto-refresh re-queries and promotes them).
      prisma.announcement.findMany({
        where: { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        orderBy: { createdAt: "asc" },
      }),
      prisma.shiftNote.findMany(),
    ]);

  const { visible } = splitNotices(activeNotices);
  const handoffNotes = Object.fromEntries(
    shiftNotes.map((n) => [n.id, n.message])
  );

  return (
    <DashboardView
      positions={positions}
      employees={employees}
      jobs={jobs}
      isAdmin={!!session?.user}
      announcements={visible.map((n) => n.message)}
      handoffNotes={handoffNotes}
      renderedAt={now.toISOString()}
      tv={tv}
    />
  );
}
