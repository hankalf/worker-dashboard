import { prisma } from "@/lib/prisma";

export default async function AdminOverview() {
  const jobCount = await prisma.job.count();
  const employeeCount = await prisma.employee.count();
  const adminCount = await prisma.employee.count({ where: { isAdmin: true } });
  const positionCount = await prisma.position.count();
  const roleCount = await prisma.role.count();
  const tabCount = await prisma.tab.count();

  const stats = [
    { label: "Jobs", value: jobCount },
    { label: "Employees", value: employeeCount },
    { label: "Admins", value: adminCount },
    { label: "Positions", value: positionCount },
    { label: "Roles", value: roleCount },
    { label: "Tabs", value: tabCount },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="rounded-lg border border-zinc-800 bg-zinc-900 p-6"
        >
          <div className="text-2xl font-semibold text-white">{stat.value}</div>
          <div className="text-sm text-zinc-400">{stat.label}</div>
        </div>
      ))}
    </div>
  );
}
