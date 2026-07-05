import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";

// Public read — notices that are live now (started and not expired), oldest first.
export async function GET() {
  const now = new Date();
  const announcements = await prisma.announcement.findMany({
    where: {
      AND: [
        { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
      ],
    },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(announcements);
}

// A notice may be scheduled at most this far ahead.
const MAX_SCHEDULE_MS = 48 * 60 * 60 * 1000;

// Admin/supervisor posts a new notice.
export async function POST(req: Request) {
  const staff = await requireStaff();
  if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { message, expiresAt, startsAt, pinned } = await req.json();
  const trimmed = typeof message === "string" ? message.trim() : "";
  if (!trimmed) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }

  const starts = startsAt ? new Date(startsAt) : null;
  if (starts && starts.getTime() > Date.now() + MAX_SCHEDULE_MS + 60_000) {
    return NextResponse.json(
      { error: "Cannot schedule more than 48 hours ahead" },
      { status: 400 }
    );
  }
  const expires = expiresAt ? new Date(expiresAt) : null;
  const announcement = await prisma.announcement.create({
    data: { message: trimmed, startsAt: starts, expiresAt: expires, pinned: !!pinned },
  });
  await logActivity(
    "Announcement",
    `Posted notice: ${trimmed}${starts ? ` (from ${starts.toLocaleString()})` : ""}${expires ? ` (until ${expires.toLocaleString()})` : ""}`,
    announcement.id
  );
  return NextResponse.json(announcement);
}
