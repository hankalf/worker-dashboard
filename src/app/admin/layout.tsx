import Link from "next/link";
import { AdminSignOutButton } from "@/components/AdminSignOutButton";

export const dynamic = "force-dynamic";

const NAV_ITEMS = [
  { href: "/admin", label: "Admin Dashboard" },
  { href: "/admin/assign", label: "Assign" },
  { href: "/admin/jobs", label: "Side Tasks" },
  { href: "/admin/employees", label: "Employees" },
  { href: "/admin/positions", label: "Positions" },
  { href: "/admin/roles", label: "Roles" },
  { href: "/admin/activity", label: "Activity" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col bg-zinc-950 text-zinc-100">
      <header className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900 px-6 py-4">
        <h1 className="text-lg font-semibold text-white">Admin Panel</h1>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/" className="text-zinc-400 hover:text-white">
            Back to Dashboard
          </Link>
          <AdminSignOutButton />
        </div>
      </header>
      <div className="flex flex-1">
        <nav className="w-48 shrink-0 border-r border-zinc-800 bg-zinc-900 p-4">
          <ul className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="block rounded-md px-3 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
