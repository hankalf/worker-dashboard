import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";

// Admin/supervisor pins or unpins a notice. Pinned notices always stay on the
// board (above the 5-at-a-time cap) and never queue out.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const staff = await requireStaff();
  if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const { pinned } = await req.json();
  const updated = await prisma.announcement.update({
    where: { id },
    data: { pinned: !!pinned },
  });
  await logActivity(
    "Announcement",
    `${pinned ? "Pinned" : "Unpinned"} notice: ${updated.message}`,
    id
  );
  return NextResponse.json(updated);
}

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
