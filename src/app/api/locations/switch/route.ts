import { NextResponse } from "next/server";
import { prisma, ACTIVE_LOCATION_COOKIE } from "@/lib/prisma";
import { DASHBOARD_SELECTED_COOKIE } from "@/lib/location";
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
  // Mark that a dashboard has been chosen this session, so the Admin Dashboard
  // tab shows the selected board rather than the Master Dashboard picker. No
  // maxAge → a session cookie that resets on the next fresh login.
  res.cookies.set(DASHBOARD_SELECTED_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}

// DELETE /api/locations/switch — return to the Master Dashboard by clearing the
// session's "a dashboard is selected" marker. The active-location scope is left
// intact so the other admin tabs keep working on the last location.
export async function DELETE() {
  if (!(await requireSuperAdmin()))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(DASHBOARD_SELECTED_COOKIE);
  return res;
}
