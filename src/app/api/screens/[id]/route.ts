import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";

// PATCH /api/screens/[id] — rename a screen or move it to another location.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireSuperAdmin()))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const { name, locationId, theme } = await req.json();

  const data: { name?: string; locationId?: string; theme?: string } = {};
  if (typeof name === "string" && name.trim()) data.name = name.trim();
  if (typeof locationId === "string" && locationId) {
    const location = await prisma.location.findUnique({ where: { id: locationId } });
    if (!location)
      return NextResponse.json({ error: "Unknown location" }, { status: 400 });
    data.locationId = locationId;
  }
  if (theme !== undefined) {
    if (theme !== "light" && theme !== "dark") {
      return NextResponse.json({ error: "Theme must be light or dark" }, { status: 400 });
    }
    data.theme = theme;
  }
  if (!data.name && !data.locationId && !data.theme) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const screen = await prisma.screen.update({ where: { id }, data });
  if (data.theme) {
    await logActivity("Fleet", `Set screen "${screen.name}" to ${data.theme} mode`);
  }
  return NextResponse.json(screen);
}

// DELETE /api/screens/[id] — unregister a screen (its display URL stops working).
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireSuperAdmin()))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const screen = await prisma.screen.findUnique({ where: { id } });
  if (!screen) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.screen.delete({ where: { id } });
  await logActivity("Fleet", `Removed screen "${screen.name}"`);
  return NextResponse.json({ ok: true });
}
