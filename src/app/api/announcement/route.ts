import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";

const ID = "current";

// Public read — the dashboard shows the pinned message to everyone.
export async function GET() {
  const announcement = await prisma.announcement.findUnique({ where: { id: ID } });
  return NextResponse.json(announcement);
}

// Admin sets (or clears) the single pinned message.
export async function PUT(req: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { message } = await req.json();
  const trimmed = typeof message === "string" ? message.trim() : "";

  if (!trimmed) {
    await prisma.announcement.deleteMany({ where: { id: ID } });
    await logActivity("Announcement", "Cleared the pinned announcement");
    return NextResponse.json(null);
  }

  const announcement = await prisma.announcement.upsert({
    where: { id: ID },
    update: { message: trimmed },
    create: { id: ID, message: trimmed },
  });
  await logActivity("Announcement", `Set announcement: ${trimmed}`);
  return NextResponse.json(announcement);
}
