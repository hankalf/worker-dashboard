import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/rbac";

export const dynamic = "force-dynamic";

// Admin: download a full JSON snapshot of the warehouse data. passwordHash is
// omitted by the shared Prisma client, so logins aren't exported.
export async function GET() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [
    employees,
    positions,
    capabilities,
    equipment,
    jobs,
    announcements,
    shiftNotes,
    settings,
    headcountSnapshots,
    workHistory,
  ] = await Promise.all([
    prisma.employee.findMany({
      include: { position: true, roles: true, capabilities: true },
    }),
    prisma.position.findMany({
      include: { requiredRole: true, requiredCapability: true },
    }),
    prisma.capability.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.role.findMany({ orderBy: { name: "asc" } }),
    prisma.job.findMany(),
    prisma.announcement.findMany(),
    prisma.shiftNote.findMany(),
    prisma.setting.findMany(),
    prisma.headcountSnapshot.findMany(),
    prisma.workHistory.findMany(),
  ]);

  const backup = {
    exportedAt: new Date().toISOString(),
    version: 1,
    employees,
    positions,
    capabilities, // "roles" in the UI
    equipment, // "equipment" in the UI (Role model)
    jobs,
    announcements,
    shiftNotes,
    settings,
    headcountSnapshots,
    workHistory,
  };

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(backup, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="warehouse-backup-${date}.json"`,
    },
  });
}
