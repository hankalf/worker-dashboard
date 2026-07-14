import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/rbac";
import { listLocations, createLocation } from "@/lib/location";
import { logActivity } from "@/lib/activity";

// GET /api/locations — every location (super-admin only; powers the switcher
// and the Locations setup page).
export async function GET() {
  if (!(await requireSuperAdmin()))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await listLocations());
}

// POST /api/locations — create a new location. { name, slug? }
export async function POST(req: Request) {
  if (!(await requireSuperAdmin()))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { name, slug } = await req.json();
  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  const location = await createLocation(name, typeof slug === "string" ? slug : undefined);
  await logActivity("Location", `Created location ${location.name}`);
  return NextResponse.json(location, { status: 201 });
}
