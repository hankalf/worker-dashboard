import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AdminSignOutButton } from "@/components/AdminSignOutButton";
import { AdminNav } from "@/components/AdminNav";
import { getDashboardName, getBranding } from "@/lib/settings";
import { getTabs } from "@/lib/tabs";
import { APP_VERSION, BUILD_VERSION } from "@/lib/version";

export const dynamic = "force-dynamic";

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
  const dashboardName = await getDashboardName();
  const branding = await getBranding();
  const tabs = await getTabs();

  return (
    <div className="flex flex-1 flex-col bg-zinc-950 text-zinc-100">
      <header
        style={{
          backgroundColor: branding.headerBg || undefined,
          color: branding.headerFg || undefined,
        }}
        className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900 px-4 py-4 sm:px-6"
      >
        <h1 className="flex items-center gap-3 text-lg font-semibold text-white">
          {branding.logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={branding.logo}
              alt=""
              className="h-8 w-auto max-w-[8rem] object-contain"
            />
          )}
          {dashboardName}
          <span className="ml-2 font-normal text-zinc-400">Admin</span>
          <span className="rounded-full bg-blue-600/20 px-2 py-0.5 text-xs font-semibold text-blue-300">
            {BUILD_VERSION}
          </span>
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
          <AdminNav isAdmin={isAdmin} tabs={tabs} />
        </nav>
        <main className="flex-1 p-4 sm:p-6">
          {children}
          <p className="mt-8 text-right text-[10px] text-zinc-600">
            {APP_VERSION}
          </p>
        </main>
      </div>
    </div>
  );
}
