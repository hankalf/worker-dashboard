import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AdminSignOutButton } from "@/components/AdminSignOutButton";

export const dynamic = "force-dynamic";

const NAV_ITEMS = [
  { href: "/admin", label: "Admin Dashboard", adminOnly: false },
  { href: "/admin/assign", label: "Assign", adminOnly: false },
  { href: "/admin/jobs", label: "Side Tasks", adminOnly: false },
  { href: "/admin/employees", label: "Employees", adminOnly: true },
  { href: "/admin/positions", label: "Positions", adminOnly: true },
  { href: "/admin/roles", label: "Roles", adminOnly: true },
  { href: "/admin/activity", label: "Activity", adminOnly: false },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const employee = session?.user?.id
    ? await prisma.employee.findUnique({
        where: { id: session.user.id },
        select: { accessLevel: true },
      })
    : null;
  const isAdmin = employee?.accessLevel === "ADMIN";
  const items = NAV_ITEMS.filter((item) => isAdmin || !item.adminOnly);

  return (
    <div className="flex flex-1 flex-col bg-zinc-950 text-zinc-100">
      <header className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900 px-4 py-4 sm:px-6">
        <h1 className="text-lg font-semibold text-white">
          Admin Panel
          {!isAdmin && (
            <span className="ml-2 rounded-full bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-400">
              Supervisor
            </span>
          )}
        </h1>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/" className="text-zinc-400 hover:text-white">
            Dashboard
          </Link>
          <AdminSignOutButton />
        </div>
      </header>
      <div className="flex flex-1 flex-col md:flex-row">
        <nav className="shrink-0 border-b border-zinc-800 bg-zinc-900 p-2 md:w-48 md:border-b-0 md:border-r md:p-4">
          <ul className="flex flex-row gap-1 overflow-x-auto md:flex-col">
            {items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="block whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
