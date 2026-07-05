import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireStaff } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";

const LEVELS = ["NONE", "SUPERVISOR", "ADMIN"];

const SHIFT_LABEL: Record<string, string> = {
  FIRST: "1st Shift",
  SECOND: "2nd Shift",
  THIRD: "3rd Shift",
};

const ATTENDANCE_LABEL: Record<string, string> = {
  PRESENT: "Present",
  ABSENT: "Absent",
  CALLED_OUT: "Called out",
};

const clock = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

// Partial update. Supervisors may change only assignment fields (position,
// attendance, lunch, shift); full admins may also change identity/access/roles.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const staff = await requireStaff();
  if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { session, isAdmin } = staff;

  const { id } = await params;
  const body = await req.json();

  // Terminate / reactivate is an admin-only action with side effects.
  if (body.terminated !== undefined) {
    if (!isAdmin)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (body.terminated && id === session.user.id)
      return NextResponse.json(
        { error: "You cannot terminate your own account" },
        { status: 400 }
      );

    if (body.terminated) {
      const employee = await prisma.employee.update({
        where: { id },
        data: {
          terminatedAt: new Date(),
          accessLevel: "NONE",
          positionId: null,
          isLead: false,
        },
        include: { position: true, roles: true },
      });
      await logActivity("Employee", `Terminated ${employee.name}`, id);
      // Archive their logs (incl. the termination entry) so they survive the
      // 14-day purge.
      await prisma.activityLog.updateMany({
        where: { subjectId: id },
        data: { archived: true },
      });
      return NextResponse.json(employee);
    } else {
      const employee = await prisma.employee.update({
        where: { id },
        data: { terminatedAt: null },
        include: { position: true, roles: true },
      });
      await logActivity("Employee", `Reactivated ${employee.name}`, id);
      return NextResponse.json(employee);
    }
  }

  const data: Record<string, unknown> = {};

  // Assignment fields — allowed for supervisors and admins.
  if (body.positionId !== undefined) data.positionId = body.positionId || null;
  if (body.attendance !== undefined) data.attendance = body.attendance || "PRESENT";
  if (body.lunchStart !== undefined) data.lunchStart = body.lunchStart || null;
  if (body.lunchEnd !== undefined) data.lunchEnd = body.lunchEnd || null;
  if (body.breakStart !== undefined) data.breakStart = body.breakStart || null;
  if (body.shift !== undefined) data.shift = body.shift || null;
  if (body.isLead !== undefined) data.isLead = !!body.isLead;

  // Identity / access / roles — admins only.
  if (isAdmin) {
    if (body.name !== undefined) data.name = body.name;
    if (body.username !== undefined) data.username = body.username || null;
    if (body.roleIds !== undefined) {
      data.roles = {
        set: (body.roleIds as string[]).map((roleId) => ({ id: roleId })),
      };
    }
    if (body.password) {
      data.passwordHash = await bcrypt.hash(body.password, 10);
    }
    if (body.accessLevel !== undefined) {
      const level = LEVELS.includes(body.accessLevel) ? body.accessLevel : "NONE";
      if (id === session.user.id && level !== "ADMIN") {
        return NextResponse.json(
          { error: "You cannot remove your own admin access" },
          { status: 400 }
        );
      }
      if (level !== "NONE" && body.username !== undefined && !body.username) {
        return NextResponse.json(
          { error: "Panel access requires a username" },
          { status: 400 }
        );
      }
      data.accessLevel = level;
    }
  }

  try {
    const employee = await prisma.employee.update({
      where: { id },
      data,
      include: { position: true, roles: true },
    });

    // Describe what changed for the activity log (positions emphasised).
    const changes: string[] = [];
    if (body.positionId !== undefined)
      changes.push(
        employee.position
          ? `position → ${employee.position.title}`
          : "position cleared"
      );
    if (body.shift !== undefined)
      changes.push(
        employee.shift ? `shift → ${SHIFT_LABEL[employee.shift]}` : "shift cleared"
      );
    if (body.lunchStart !== undefined)
      changes.push(
        employee.lunchStart ? `lunch → ${clock(employee.lunchStart)}` : "lunch cleared"
      );
    if (body.breakStart !== undefined)
      changes.push(
        employee.breakStart ? `break → ${clock(employee.breakStart)}` : "break cleared"
      );
    if (body.attendance !== undefined)
      changes.push(`marked ${ATTENDANCE_LABEL[employee.attendance] ?? employee.attendance}`);
    if (body.isLead !== undefined)
      changes.push(employee.isLead ? "set as lead" : "removed as lead");
    if (isAdmin && body.roleIds !== undefined)
      changes.push(
        employee.roles.length
          ? `equipment → ${employee.roles.map((r) => r.name).join(", ")}`
          : "equipment cleared"
      );
    if (
      isAdmin &&
      (body.name !== undefined ||
        body.username !== undefined ||
        body.accessLevel !== undefined ||
        body.password)
    )
      changes.push("details updated");

    await logActivity(
      "Employee",
      `${employee.name}: ${changes.length ? changes.join(", ") : "updated"}`,
      employee.id
    );
    return NextResponse.json(employee);
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      return NextResponse.json(
        { error: `The username "${body.username}" is already taken` },
        { status: 400 }
      );
    }
    console.error("Failed to update employee:", error);
    return NextResponse.json(
      { error: "Could not save the employee — check the values and try again" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  if (id === session.user.id) {
    return NextResponse.json(
      { error: "You cannot delete your own account" },
      { status: 400 }
    );
  }

  const employee = await prisma.employee.findUnique({ where: { id } });
  await prisma.employee.delete({ where: { id } });
  if (employee) await logActivity("Employee", `Removed ${employee.name}`, id);
  return NextResponse.json({ ok: true });
}
