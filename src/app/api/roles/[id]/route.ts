import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const { name, description } = await req.json();
  const role = await prisma.role.update({
    where: { id },
    data: { name, description },
  });
  await logActivity("Role", `Renamed role to ${role.name}`);
  return NextResponse.json(role);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const role = await prisma.role.findUnique({ where: { id } });
  await prisma.role.delete({ where: { id } });
  if (role) await logActivity("Role", `Deleted role ${role.name}`);
  return NextResponse.json({ ok: true });
}
