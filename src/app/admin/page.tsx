import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma, getActiveLocationId, runWithLocation } from "@/lib/prisma";
import { requireStaff } from "@/lib/rbac";
import {
  listLocations,
  getActiveLocation,
  DASHBOARD_SELECTED_COOKIE,
} from "@/lib/location";
import { AdminDashboard } from "@/components/AdminDashboard";
import { LocationPicker, type LocationCard } from "@/components/LocationPicker";
import { DashboardSelectionBar } from "@/components/DashboardSelectionBar";
import { ScreenHealthBanner } from "@/components/ScreenHealthBanner";
import { currentShift } from "@/lib/shift";
import { easternDateKey } from "@/lib/time";
import { recordWorkHistory, purgeOldWorkHistory } from "@/lib/workHistory";
import { recordLunchHistory, purgeOldLunchHistory } from "@/lib/lunchHistory";
import { recordAttendance, purgeOldAttendance } from "@/lib/attendanceHistory";
import { getBranding, getShiftBounds } from "@/lib/settings";
import { getActiveLaborShare } from "@/lib/laborShareServer";

export const dynamic = "force-dynamic";

// Build a "Master Dashboard" card per location — name, slug and a live
// headcount — each counted inside its own tenant scope.
async function buildLocationCards(
  locations: { id: string; name: string; slug: string }[]
): Promise<LocationCard[]> {
  return Promise.all(
    locations.map((loc) =>
      runWithLocation(loc.id, async () => {
        const roster = await prisma.employee.findMany({
          where: { terminatedAt: null },
          select: { attendance: true },
        });
        return {
          id: loc.id,
          name: loc.name,
          slug: loc.slug,
          employees: roster.length,
          present: roster.filter((e) => e.attendance === "PRESENT").length,
        };
      })
    )
  );
}

export default async function AdminDashboardPage() {
  const staff = await requireStaff();
  if (!staff) redirect("/login");

  // A super-admin who spans more than one location lands on the Master
  // Dashboard: a list of every dashboard to choose from. Until one is picked
  // this session, the tab shows only that list (no single location's board).
  // Single-location super-admins and per-location staff skip this entirely —
  // they only ever have their own location.
  const locations = staff.isSuperAdmin ? await listLocations() : [];
  const multiLocation = locations.length > 1;
  const cookieStore = await cookies();
  const dashboardSelected =
    cookieStore.get(DASHBOARD_SELECTED_COOKIE)?.value === "1";
  if (staff.isSuperAdmin && multiLocation && !dashboardSelected) {
    const locationCards = await buildLocationCards(locations);
    return (
      <>
        <ScreenHealthBanner />
        <LocationPicker locations={locationCards} activeId={null} />
      </>
    );
  }

  const now = new Date();
  const shiftBounds = await getShiftBounds();

  const [positions, employees, jobs, capabilities, active] =
    await Promise.all([
    prisma.position.findMany({
      orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    }),
    prisma.employee.findMany({
      where: { terminatedAt: null },
      include: {
        position: true,
        roles: true,
        capabilities: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
      },
      orderBy: { name: "asc" },
    }),
    prisma.job.findMany({
      include: { assignedEmployee: { include: { position: true } } },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    }),
    prisma.capability.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    // Active notices (live + queued), oldest first — for the board mirror.
    prisma.announcement.findMany({
      where: { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  // Lazy attendance-history snapshot: record the current shift's headcount,
  // throttled to at most once every 2 minutes so the 15s auto-refresh doesn't
  // hammer the DB. Best-effort — never let it break the dashboard.
  try {
    const shiftKey = currentShift(now, shiftBounds);
    const dateKey = easternDateKey(now);
    const roster = employees.filter(
      (e) => e.shift === null || e.shift === shiftKey
    );
    const present = roster.filter((e) => e.attendance === "PRESENT").length;
    const locationId = await getActiveLocationId();
    const existing = locationId
      ? await prisma.headcountSnapshot.findUnique({
          where: {
            locationId_date_shift: { locationId, date: dateKey, shift: shiftKey },
          },
        })
      : null;
    if (
      locationId &&
      (!existing || now.getTime() - existing.updatedAt.getTime() > 120_000)
    ) {
      await prisma.headcountSnapshot.upsert({
        where: {
          locationId_date_shift: { locationId, date: dateKey, shift: shiftKey },
        },
        update: { present, total: roster.length },
        create: { date: dateKey, shift: shiftKey, present, total: roster.length },
      });

      // Record what position each present employee worked today, then prune
      // work history older than the 2-week window.
      await Promise.all(
        employees
          .filter((e) => e.attendance === "PRESENT" && e.position)
          .map((e) =>
            recordWorkHistory(e.id, e.name, e.positionId!, e.position!.title, now)
          )
      );
      await purgeOldWorkHistory();

      // Everyone on this shift, however they're marked — the absences are the
      // point, so this can't be filtered to those present.
      await recordAttendance(
        now,
        roster.map((e) => ({
          id: e.id,
          name: e.name,
          shift: e.shift,
          status: e.attendance,
        }))
      );
      await purgeOldAttendance();

      // Log today's scheduled lunches (present + has a lunch), then prune old.
      await recordLunchHistory(
        now,
        employees
          .filter(
            (e) =>
              e.attendance === "PRESENT" &&
              e.lunchStart &&
              e.accessLevel !== "ADMIN"
          )
          .map((e) => ({ id: e.id, name: e.name, lunchStart: e.lunchStart!, shift: e.shift }))
      );
      await purgeOldLunchHistory();
    }
  } catch (e) {
    console.error("snapshot failed:", e);
  }

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

  const branding = await getBranding();
  const laborShare = await getActiveLaborShare(now);

  // A super-admin viewing a selected dashboard (and who has more than one) sees
  // a bar naming it, with a way back to the Master Dashboard list.
  const selectedLocation =
    staff.isSuperAdmin && multiLocation ? await getActiveLocation() : null;

  return (
    <>
      {selectedLocation && <DashboardSelectionBar name={selectedLocation.name} />}
      {staff.isSuperAdmin && <ScreenHealthBanner />}
      <AdminDashboard
        positions={positions}
        employees={employees}
        jobs={jobs}
        capabilities={capabilities}
        notices={active.map(toDto)}
        branding={branding}
        laborShare={laborShare}
        shiftBounds={shiftBounds}
      />
    </>
  );
}
