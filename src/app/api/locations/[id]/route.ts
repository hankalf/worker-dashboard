import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/rbac";
import { slugify } from "@/lib/location";
import { logActivity } from "@/lib/activity";

// PATCH /api/locations/[id] — rename a location (and optionally change its slug).
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireSuperAdmin()))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const { name, slug } = await req.json();

  const data: { name?: string; slug?: string } = {};
  if (typeof name === "string" && name.trim()) data.name = name.trim();
  if (typeof slug === "string" && slug.trim()) data.slug = slugify(slug);
  if (!data.name && !data.slug) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  try {
    const location = await prisma.location.update({ where: { id }, data });
    await logActivity("Location", `Renamed location to ${location.name}`);
    return NextResponse.json(location);
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "That slug is already in use" }, { status: 400 });
    }
    return NextResponse.json({ error: "Could not update the location" }, { status: 500 });
  }
}

// DELETE /api/locations/[id] — remove a location AND everything in it (cascade).
// Guarded so you can't delete the last location or your own home location.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSuperAdmin();
  if (!session)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  if (session.user.locationId === id) {
    return NextResponse.json(
      { error: "You can't delete your own location. Move your account first." },
      { status: 400 }
    );
  }
  if ((await prisma.location.count()) <= 1) {
    return NextResponse.json(
      { error: "Can't delete the only remaining location" },
      { status: 400 }
    );
  }

  const location = await prisma.location.findUnique({ where: { id } });
  if (!location) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.location.delete({ where: { id } });
  await logActivity("Location", `Deleted location ${location.name} (and all its data)`);
  return NextResponse.json({ ok: true });
}
