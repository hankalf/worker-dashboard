import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";

// Admin: set the display order of roles. Body { ids: string[] } — each role's
// sortOrder becomes its index, so employee cards list roles in that order.
export async function POST(req: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { ids } = await req.json();
  if (!Array.isArray(ids)) {
    return NextResponse.json({ error: "ids array required" }, { status: 400 });
  }

  await prisma.$transaction(
    ids.map((id: string, i: number) =>
      prisma.capability.update({ where: { id }, data: { sortOrder: i } })
    )
  );
  await logActivity("Role", "Reordered roles");
  return NextResponse.json({ ok: true });
}
