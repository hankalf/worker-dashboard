import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/rbac";
import { logActivity, getActorName } from "@/lib/activity";

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

// A regular notice may be scheduled at most 48h ahead; a preplanned event can
// be scheduled far in advance (up to ~2 years).
const MAX_SCHEDULE_MS = 48 * 60 * 60 * 1000;
const MAX_EVENT_MS = 730 * 24 * 60 * 60 * 1000;

// Admin/supervisor posts a new notice (or a preplanned event).
export async function POST(req: Request) {
  const staff = await requireStaff();
  if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { message, expiresAt, startsAt, pinned, isEvent } = await req.json();
  const trimmed = typeof message === "string" ? message.trim() : "";
  if (!trimmed) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }

  const event = !!isEvent;
  const starts = startsAt ? new Date(startsAt) : null;
  const maxAhead = event ? MAX_EVENT_MS : MAX_SCHEDULE_MS;
  if (starts && starts.getTime() > Date.now() + maxAhead + 60_000) {
    return NextResponse.json(
      {
        error: event
          ? "Event date is too far ahead"
          : "Cannot schedule more than 48 hours ahead",
      },
      { status: 400 }
    );
  }
  const expires = expiresAt ? new Date(expiresAt) : null;
  const announcement = await prisma.announcement.create({
    data: {
      message: trimmed,
      startsAt: starts,
      expiresAt: expires,
      pinned: !!pinned,
      isEvent: event,
    },
  });
  // Append to the notice history (survives deletion) with who posted it.
  await prisma.noticeLog.create({
    data: { message: trimmed, postedBy: await getActorName() },
  });
  await logActivity(
    "Announcement",
    `Posted notice: ${trimmed}${starts ? ` (from ${starts.toLocaleString()})` : ""}${expires ? ` (until ${expires.toLocaleString()})` : ""}`,
    announcement.id
  );
  return NextResponse.json(announcement);
}
