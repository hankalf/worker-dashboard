import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireStaff } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";

const LEVELS = ["NONE", "SUPERVISOR", "ADMIN"];

export async function GET(req: Request) {
  // Supervisors need the roster to run the Assign board.
  const staff = await requireStaff();
  if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const includeTerminated =
    new URL(req.url).searchParams.get("includeTerminated") === "1";

  const employees = await prisma.employee.findMany({
    where: includeTerminated ? undefined : { terminatedAt: null },
    include: {
      position: true,
      roles: true,
      capabilities: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
    },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(employees);
}

export async function POST(req: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const {
    name,
    positionId,
    roleIds,
    capabilityIds,
    accessLevel,
    username,
    password,
    shift,
    attendance,
    isLead,
    lunchStart,
    breakStart,
  } = await req.json();
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  const level = LEVELS.includes(accessLevel) ? accessLevel : "NONE";
  if (level !== "NONE" && (!username || !password)) {
    return NextResponse.json(
      { error: "Panel access requires a username and password" },
      { status: 400 }
    );
  }

  try {
    const employee = await prisma.employee.create({
      data: {
        name,
        positionId: positionId || null,
        accessLevel: level,
        username: username || null,
        passwordHash: password ? await bcrypt.hash(password, 10) : null,
        shift: shift || null,
        attendance: attendance || "PRESENT",
        isLead: !!isLead,
        lunchStart: lunchStart || null,
        breakStart: breakStart || null,
        roles: {
          connect: (roleIds ?? []).map((id: string) => ({ id })),
        },
        capabilities: {
          connect: (capabilityIds ?? []).map((id: string) => ({ id })),
        },
      },
      include: { position: true, roles: true, capabilities: true },
    });
    await logActivity("Employee", `Added ${employee.name}`, employee.id);
    return NextResponse.json(employee, { status: 201 });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      return NextResponse.json(
        { error: `The username "${username}" is already taken` },
        { status: 400 }
      );
    }
    console.error("Failed to create employee:", error);
    return NextResponse.json(
      { error: "Could not save the employee — check the values and try again" },
      { status: 500 }
    );
  }
}
