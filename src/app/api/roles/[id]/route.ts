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
  const { name, description, sortOrder } = await req.json();
  const role = await prisma.capability.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(description !== undefined ? { description: description || null } : {}),
      // Leave the display order untouched unless explicitly provided.
      ...(sortOrder !== undefined ? { sortOrder: Number(sortOrder) || 0 } : {}),
    },
  });
  await logActivity("Role", `Updated role ${role.name}`);
  return NextResponse.json(role);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const role = await prisma.capability.findUnique({ where: { id } });
  await prisma.capability.delete({ where: { id } });
  if (role) await logActivity("Role", `Deleted role ${role.name}`);
  return NextResponse.json({ ok: true });
}
