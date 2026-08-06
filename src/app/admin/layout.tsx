import Link from "next/link";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AdminSignOutButton } from "@/components/AdminSignOutButton";
import { AdminNav } from "@/components/AdminNav";
import { LocationSwitcher } from "@/components/LocationSwitcher";
import { DashboardGate } from "@/components/DashboardGate";
import { getDashboardName, getBranding } from "@/lib/settings";
import { getTabs } from "@/lib/tabs";
import {
  listLocations,
  getActiveLocation,
  DASHBOARD_SELECTED_COOKIE,
} from "@/lib/location";
import { APP_VERSION } from "@/lib/version";
import { getBuildVersion } from "@/lib/buildVersionServer";

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
        select: { accessLevel: true, isSuperAdmin: true },
      })
    : null;
  const level = employee?.accessLevel ?? "NONE";
  const isAdmin = level === "ADMIN";
  const isSuperAdmin = !!employee?.isSuperAdmin;
  const dashboardName = await getDashboardName();
  const branding = await getBranding();
  const buildVersion = await getBuildVersion();
  const tabs = await getTabs();
  // Location context for the header: super-admins get a switcher across all
  // locations; everyone else sees a static badge for the one they're in.
  const activeLocation = await getActiveLocation();
  const locations = isSuperAdmin ? await listLocations() : [];
  // A super-admin with more than one location must pick a dashboard (this
  // session) before the per-location tabs unlock. Single-location super-admins
  // and per-location staff skip this entirely.
  const cookieStore = await cookies();
  const dashboardSelected =
    cookieStore.get(DASHBOARD_SELECTED_COOKIE)?.value === "1";
  const needsSelection =
    isSuperAdmin && locations.length > 1 && !dashboardSelected;

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
            {buildVersion}
          </span>
          {!isAdmin && level !== "NONE" && (
            <span className="ml-2 rounded-full bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-400">
              {level === "SUPERVISOR" ? "Supervisor" : "Lead"}
            </span>
          )}
        </h1>
        <div className="flex items-center gap-4 text-sm">
          {isSuperAdmin ? (
            <LocationSwitcher
              locations={locations}
              activeId={needsSelection ? null : activeLocation?.id ?? null}
            />
          ) : (
            activeLocation && (
              <span
                title="Your warehouse"
                className="rounded-full bg-zinc-800 px-3 py-1 text-xs font-medium text-zinc-300"
              >
                {activeLocation.name}
              </span>
            )
          )}
          <Link href="/" className="text-zinc-400 hover:text-white">
            Dashboard
          </Link>
          <AdminSignOutButton />
        </div>
      </header>
      <div className="flex flex-1 flex-col md:flex-row">
        <nav className="shrink-0 border-b border-zinc-800 bg-zinc-900 p-2 md:w-48 md:border-b-0 md:border-r md:p-4">
          <AdminNav
            level={level}
            tabs={tabs}
            isSuperAdmin={isSuperAdmin}
            needsSelection={needsSelection}
          />
        </nav>
        <main className="flex-1 p-4 sm:p-6">
          <DashboardGate needsSelection={needsSelection}>{children}</DashboardGate>
          <p className="mt-8 text-right text-[10px] text-zinc-600">
            {APP_VERSION}
          </p>
        </main>
      </div>
    </div>
  );
}
