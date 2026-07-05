import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";

// Admin: set position display order. Body { ids: string[] } — each position's
// sortOrder becomes its index, so the dashboard/assign board list in that order.
export async function POST(req: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { ids } = await req.json();
  if (!Array.isArray(ids)) {
    return NextResponse.json({ error: "ids array required" }, { status: 400 });
  }

  await prisma.$transaction(
    ids.map((id: string, i: number) =>
      prisma.position.update({ where: { id }, data: { sortOrder: i } })
    )
  );
  await logActivity("Position", "Reordered positions");
  return NextResponse.json({ ok: true });
}
