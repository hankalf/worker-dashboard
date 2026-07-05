import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";

// Public read — active (non-expired) notices, oldest first.
export async function GET() {
  const now = new Date();
  const announcements = await prisma.announcement.findMany({
    where: { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(announcements);
}

// Admin/supervisor posts a new notice.
export async function POST(req: Request) {
  const staff = await requireStaff();
  if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { message, expiresAt } = await req.json();
  const trimmed = typeof message === "string" ? message.trim() : "";
  if (!trimmed) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }

  const expires = expiresAt ? new Date(expiresAt) : null;
  const announcement = await prisma.announcement.create({
    data: { message: trimmed, expiresAt: expires },
  });
  await logActivity(
    "Announcement",
    `Posted notice: ${trimmed}${expires ? ` (until ${expires.toLocaleString()})` : ""}`,
    announcement.id
  );
  return NextResponse.json(announcement);
}
