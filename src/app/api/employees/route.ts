import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/rbac";

export async function GET() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const employees = await prisma.employee.findMany({
    include: { position: true, roles: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(employees);
}

export async function POST(req: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { name, positionId, roleIds, isAdmin, username, password } = await req.json();
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (isAdmin && (!username || !password)) {
    return NextResponse.json(
      { error: "Admin access requires a username and password" },
      { status: 400 }
    );
  }

  const employee = await prisma.employee.create({
    data: {
      name,
      positionId: positionId || null,
      isAdmin: !!isAdmin,
      username: username || null,
      passwordHash: password ? await bcrypt.hash(password, 10) : null,
      roles: {
        connect: (roleIds ?? []).map((id: string) => ({ id })),
      },
    },
    include: { position: true, roles: true },
  });
  return NextResponse.json(employee, { status: 201 });
}
