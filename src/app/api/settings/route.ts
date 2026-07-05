import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import { getDashboardName, setDashboardName } from "@/lib/settings";

export const dynamic = "force-dynamic";

// Public: current site settings (the login page reads this).
export async function GET() {
  return NextResponse.json({ dashboardName: await getDashboardName() });
}

// Admin: update the dashboard name.
export async function PATCH(req: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { dashboardName } = await req.json();
  if (typeof dashboardName !== "string" || !dashboardName.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const value = await setDashboardName(dashboardName);
  await logActivity("Settings", `Renamed dashboard to ${value}`);
  return NextResponse.json({ dashboardName: value });
}
