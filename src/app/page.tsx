import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DashboardView } from "@/components/DashboardView";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ tv?: string }>;
}) {
  const session = await auth();
  const tv = (await searchParams).tv === "1";

  const [positions, employees, jobs, announcement] = await Promise.all([
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
    prisma.announcement.findUnique({ where: { id: "current" } }),
  ]);

  return (
    <DashboardView
      positions={positions}
      employees={employees}
      jobs={jobs}
      isAdmin={!!session?.user}
      announcement={
        announcement &&
        (!announcement.expiresAt || announcement.expiresAt > new Date())
          ? announcement.message
          : null
      }
      tv={tv}
    />
  );
}
