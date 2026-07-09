import { prisma } from "@/lib/prisma";
import { NoticesManager } from "@/components/NoticesManager";

export const dynamic = "force-dynamic";

export default async function NoticesPage() {
  const now = new Date();

  // Tidy up notices that expired more than a week ago.
  await prisma.announcement.deleteMany({
    where: { expiresAt: { lt: new Date(now.getTime() - 7 * 24 * 3600 * 1000) } },
  });

  const [active, expired] = await Promise.all([
    // Active notices (live + queued + scheduled), oldest first.
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
    <div className="max-w-5xl">
      <h2 className="mb-4 text-lg font-semibold text-white">Notices</h2>
      <NoticesManager
        notices={active.map(toDto)}
        expiredNotices={expired.map(toDto)}
      />
    </div>
  );
}
