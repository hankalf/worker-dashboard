import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DashboardView } from "@/components/DashboardView";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await auth();

  const [tabs, jobs] = await Promise.all([
    prisma.tab.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.job.findMany({
      include: { tab: true, assignedEmployee: { include: { position: true } } },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    }),
  ]);

  return <DashboardView tabs={tabs} jobs={jobs} isAdmin={!!session?.user} />;
}
