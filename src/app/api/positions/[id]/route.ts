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
  const {
    title,
    description,
    requiredRoleId,
    requiredCapabilityId,
    sortOrder,
    minFirst,
    minSecond,
    minThird,
  } = await req.json();
  const clampMin = (v: unknown) => Math.max(0, Math.min(99, Number(v) || 0));
  const position = await prisma.position.update({
    where: { id },
    // Partial-safe: only touch fields that were actually sent, so a
    // description-only edit doesn't clear the required role/equipment.
    data: {
      ...(title !== undefined ? { title } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(requiredRoleId !== undefined
        ? { requiredRoleId: requiredRoleId || null }
        : {}),
      ...(requiredCapabilityId !== undefined
        ? { requiredCapabilityId: requiredCapabilityId || null }
        : {}),
      ...(sortOrder !== undefined ? { sortOrder: Number(sortOrder) || 0 } : {}),
      ...(minFirst !== undefined ? { minFirst: clampMin(minFirst) } : {}),
      ...(minSecond !== undefined ? { minSecond: clampMin(minSecond) } : {}),
      ...(minThird !== undefined ? { minThird: clampMin(minThird) } : {}),
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
