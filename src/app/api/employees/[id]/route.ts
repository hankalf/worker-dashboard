import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";

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

// Partial update: only fields present in the body are changed, so quick
// single-field edits (e.g. the assign board setting positionId) don't
// clobber admin access, username, or roles.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();

  if (body.isAdmin === true && body.username !== undefined && !body.username) {
    return NextResponse.json(
      { error: "Admin access requires a username" },
      { status: 400 }
    );
  }
  if (id === session.user.id && body.isAdmin === false) {
    return NextResponse.json(
      { error: "You cannot remove your own admin access" },
      { status: 400 }
    );
  }

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.positionId !== undefined) data.positionId = body.positionId || null;
  if (body.isAdmin !== undefined) data.isAdmin = !!body.isAdmin;
  if (body.username !== undefined) data.username = body.username || null;
  if (body.lunchStart !== undefined) data.lunchStart = body.lunchStart || null;
  if (body.lunchEnd !== undefined) data.lunchEnd = body.lunchEnd || null;
  if (body.shift !== undefined) data.shift = body.shift || null;
  if (body.attendance !== undefined) data.attendance = body.attendance || "PRESENT";
  if (body.roleIds !== undefined) {
    data.roles = { set: (body.roleIds as string[]).map((roleId) => ({ id: roleId })) };
  }
  if (body.password) {
    data.passwordHash = await bcrypt.hash(body.password, 10);
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
    if (body.attendance !== undefined)
      changes.push(`marked ${ATTENDANCE_LABEL[employee.attendance] ?? employee.attendance}`);
    if (body.roleIds !== undefined)
      changes.push(
        employee.roles.length
          ? `roles → ${employee.roles.map((r) => r.name).join(", ")}`
          : "roles cleared"
      );
    if (
      body.name !== undefined ||
      body.username !== undefined ||
      body.isAdmin !== undefined ||
      body.password
    )
      changes.push("details updated");

    await logActivity(
      "Employee",
      `${employee.name}: ${changes.length ? changes.join(", ") : "updated"}`
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
  if (employee) await logActivity("Employee", `Removed ${employee.name}`);
  return NextResponse.json({ ok: true });
}
