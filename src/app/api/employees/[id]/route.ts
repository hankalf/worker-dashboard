import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/rbac";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const { name, positionId, roleIds, isAdmin, email, password } = await req.json();

  if (isAdmin && !email) {
    return NextResponse.json(
      { error: "Admin access requires an email" },
      { status: 400 }
    );
  }
  if (id === session.user.id && !isAdmin) {
    return NextResponse.json(
      { error: "You cannot remove your own admin access" },
      { status: 400 }
    );
  }

  const data: Record<string, unknown> = {
    name,
    positionId: positionId || null,
    isAdmin: !!isAdmin,
    email: email || null,
    roles: {
      set: ((roleIds ?? []) as string[]).map((roleId) => ({ id: roleId })),
    },
  };
  if (password) {
    data.passwordHash = await bcrypt.hash(password, 10);
  }

  const employee = await prisma.employee.update({
    where: { id },
    data,
    include: { position: true, roles: true },
  });
  return NextResponse.json(employee);
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

  await prisma.employee.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
