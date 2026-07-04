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
  const { title, description, requiredRoleId, sortOrder } = await req.json();
  const position = await prisma.position.update({
    where: { id },
    data: {
      title,
      description,
      requiredRoleId: requiredRoleId || null,
      sortOrder: Number(sortOrder) || 0,
    },
  });
  await logActivity("Position", `Renamed position to ${position.title}`);
  return NextResponse.json(position);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const position = await prisma.position.findUnique({ where: { id } });
  await prisma.position.delete({ where: { id } });
  if (position) await logActivity("Position", `Deleted position ${position.title}`);
  return NextResponse.json({ ok: true });
}
