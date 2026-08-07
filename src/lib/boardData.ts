import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { splitNotices } from "@/lib/announcements";
import {
  getDashboardName,
  getRotationConfig,
  getScrollSpeed,
  getBoardFontScale,
  getBranding,
  getShiftBounds,
} from "@/lib/settings";
import { applyDueSchedules } from "@/lib/scheduleServer";
import { getActiveLaborShare } from "@/lib/laborShareServer";
import {
  getEmployeeDockStatuses,
  getDockSchedule,
  normalizeName,
} from "@/lib/opendock";
import { APP_VERSION } from "@/lib/version";

// Fetch every prop the public board needs, scoped to the active location.
// Shared by the root board (/) and each fleet screen (/screen/[token]); a
// screen wraps this in runWithLocation() to pin it to that screen's location.
export async function fetchBoardProps() {
  const session = await auth();
  const now = new Date();
  // If a plan was scheduled for today, push it onto the live board (once/day).
  await applyDueSchedules(now);

  const [positions, employees, jobs, activeNotices, dashboardName] =
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
      // Notices live now — started and not expired — oldest first.
      prisma.announcement.findMany({
        where: {
          AND: [
            { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
            { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          ],
        },
        orderBy: { createdAt: "asc" },
      }),
      getDashboardName(),
    ]);

  const rotation = await getRotationConfig();
  const scrollSpeed = await getScrollSpeed();
  const fontScale = await getBoardFontScale();
  const branding = await getBranding();
  const shiftBounds = await getShiftBounds();
  const laborShare = await getActiveLaborShare(now);

  // Live dock statuses from Opendock (empty unless the integration is on),
  // matched to each employee by the appointment tag that carries their name.
  const dockStatuses = await getEmployeeDockStatuses();
  const employeesWithDock = employees.map((e) => ({
    ...e,
    dockStatus: dockStatuses[normalizeName(e.name)] ?? null,
  }));

  // Today's dock schedule, only when the board is set to rotate through it.
  const dockSchedule = rotation.dock ? await getDockSchedule(now) : null;

  const { visible } = splitNotices(activeNotices);

  return {
    positions,
    employees: employeesWithDock,
    jobs,
    isAdmin: !!session?.user,
    announcements: visible.map((n) => n.message),
    renderedAt: now.toISOString(),
    title: dashboardName,
    rotatingUrl: rotation.url,
    rotationSeconds: rotation.seconds,
    rotatingEnabled: rotation.enabled,
    dockSchedule,
    dockHidden: rotation.dockHidden,
    scrollSpeed,
    fontScale,
    branding,
    laborShare,
    version: APP_VERSION,
    shiftBounds,
  };
}
