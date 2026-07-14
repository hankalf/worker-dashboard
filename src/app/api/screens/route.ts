import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";

// GET /api/screens — every registered screen with its location (super-admin).
export async function GET() {
  if (!(await requireSuperAdmin()))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const screens = await prisma.screen.findMany({
    include: { location: { select: { name: true, slug: true } } },
    orderBy: [{ locationId: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json(screens);
}

// POST /api/screens — register a screen. { name, locationId }
export async function POST(req: Request) {
  if (!(await requireSuperAdmin()))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { name, locationId } = await req.json();
  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (typeof locationId !== "string" || !locationId) {
    return NextResponse.json({ error: "A location is required" }, { status: 400 });
  }
  const location = await prisma.location.findUnique({ where: { id: locationId } });
  if (!location) {
    return NextResponse.json({ error: "Unknown location" }, { status: 400 });
  }

  const token = randomBytes(12).toString("base64url");
  const screen = await prisma.screen.create({
    data: { name: name.trim(), locationId, token },
  });
  await logActivity("Fleet", `Registered screen "${screen.name}" for ${location.name}`);
  return NextResponse.json(screen, { status: 201 });
}
