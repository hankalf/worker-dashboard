import { NextResponse } from "next/server";
import { prisma, ACTIVE_LOCATION_COOKIE } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/rbac";

// POST /api/locations/switch — set the active location for a super-admin.
// { locationId }. The cookie is httpOnly (only the server-side scoping reads
// it) and only ever set here, after verifying super-admin + a real location;
// non-super-admins are confined to their own location by the resolver, so this
// endpoint is the sole, guarded way to change the active tenant.
export async function POST(req: Request) {
  if (!(await requireSuperAdmin()))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { locationId } = await req.json();
  if (typeof locationId !== "string" || !locationId) {
    return NextResponse.json({ error: "locationId is required" }, { status: 400 });
  }
  const location = await prisma.location.findUnique({ where: { id: locationId } });
  if (!location) {
    return NextResponse.json({ error: "Unknown location" }, { status: 404 });
  }

  const res = NextResponse.json({ ok: true, location });
  res.cookies.set(ACTIVE_LOCATION_COOKIE, location.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
