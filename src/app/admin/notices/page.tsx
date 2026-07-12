import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/rbac";
import { NoticesManager } from "@/components/NoticesManager";

export const dynamic = "force-dynamic";

export default async function NoticesPage() {
  if (!(await requireStaff())) redirect("/login");
  const now = new Date();

  // Tidy up notices that expired more than a week ago.
  await prisma.announcement.deleteMany({
    where: { expiresAt: { lt: new Date(now.getTime() - 7 * 24 * 3600 * 1000) } },
  });

  const [active, expired, events, log] = await Promise.all([
    // Active regular notices (live + queued + scheduled), oldest first.
    prisma.announcement.findMany({
      where: {
        isEvent: false,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { createdAt: "asc" },
    }),
    // The most recently expired regular notices, so admins see what dropped off.
    prisma.announcement.findMany({
      where: { isEvent: false, expiresAt: { lte: now } },
      orderBy: { expiresAt: "desc" },
      take: 10,
    }),
    // Preplanned events (not yet expired), soonest first.
    prisma.announcement.findMany({
      where: { isEvent: true, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      orderBy: [{ startsAt: "asc" }, { createdAt: "asc" }],
    }),
    // Full history of everything posted (kept even after deletion).
    prisma.noticeLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
  ]);

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

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold text-white">Notices</h2>
      <NoticesManager
        notices={active.map(toDto)}
        expiredNotices={expired.map(toDto)}
        events={events.map(toDto)}
        log={log.map((l) => ({
          id: l.id,
          message: l.message,
          postedBy: l.postedBy,
          createdAt: l.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
