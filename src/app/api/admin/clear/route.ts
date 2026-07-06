import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";

const ALLOWED = ["employees", "positions", "roles", "equipment", "activity"];

// Admin: bulk-clear selected datasets. Irreversible. Login accounts (admins /
// supervisors) are preserved when clearing employees so nobody is locked out.
export async function POST(req: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { targets } = await req.json();
  if (!Array.isArray(targets) || targets.some((t) => !ALLOWED.includes(t))) {
    return NextResponse.json({ error: "Invalid targets" }, { status: 400 });
  }

  const cleared: Record<string, number> = {};

  if (targets.includes("employees")) {
    // Detach side tasks, then delete non-login employees only.
    await prisma.job.updateMany({ data: { assignedEmployeeId: null } });
    const res = await prisma.employee.deleteMany({
      where: { accessLevel: "NONE" },
    });
    cleared.employees = res.count;
  }
  if (targets.includes("positions")) {
    const res = await prisma.position.deleteMany();
    cleared.positions = res.count;
  }
  if (targets.includes("roles")) {
    const res = await prisma.capability.deleteMany();
    cleared.roles = res.count;
  }
  if (targets.includes("equipment")) {
    const res = await prisma.role.deleteMany();
    cleared.equipment = res.count;
  }
  if (targets.includes("activity")) {
    const [a, t, w, h] = await Promise.all([
      prisma.activityLog.deleteMany(),
      prisma.taskLog.deleteMany(),
      prisma.workHistory.deleteMany(),
      prisma.headcountSnapshot.deleteMany(),
    ]);
    cleared.activity = a.count + t.count + w.count + h.count;
  }

  await logActivity(
    "Settings",
    `Cleared data: ${targets.join(", ")}`
  );
  return NextResponse.json({ ok: true, cleared });
}
