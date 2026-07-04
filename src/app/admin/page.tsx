import { prisma } from "@/lib/prisma";
import { AdminDashboard } from "@/components/AdminDashboard";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const [positions, employees, jobs] = await Promise.all([
    prisma.position.findMany({ orderBy: { title: "asc" } }),
    prisma.employee.findMany({
      include: { position: true, roles: true },
      orderBy: { name: "asc" },
    }),
    prisma.job.findMany({
      include: { assignedEmployee: { include: { position: true } } },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    }),
  ]);

  return (
    <AdminDashboard positions={positions} employees={employees} jobs={jobs} />
  );
}
