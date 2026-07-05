import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";

// Admin/supervisor deletes a notice (whether live, queued, or expired).
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const staff = await requireStaff();
  if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const existing = await prisma.announcement.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ ok: true });

  await prisma.announcement.delete({ where: { id } });
  await logActivity("Announcement", `Deleted notice: ${existing.message}`, id);
  return NextResponse.json({ ok: true });
}
