import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import {
  getDashboardName,
  setDashboardName,
  setSetting,
  getRotationConfig,
  getScrollSpeed,
} from "@/lib/settings";

export const dynamic = "force-dynamic";

// Public: current site settings (login page + rotating-dashboard editor).
export async function GET() {
  const [dashboardName, rotation, scrollSpeed] = await Promise.all([
    getDashboardName(),
    getRotationConfig(),
    getScrollSpeed(),
  ]);
  return NextResponse.json({
    dashboardName,
    rotatingUrl: rotation.url,
    rotationSeconds: rotation.seconds,
    rotatingEnabled: rotation.enabled,
    scrollSpeed,
  });
}

// Admin: partial update — only the provided fields are changed.
export async function PATCH(req: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();

  if (body.dashboardName !== undefined) {
    if (typeof body.dashboardName !== "string" || !body.dashboardName.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    await setDashboardName(body.dashboardName);
  }
  if (body.rotatingUrl !== undefined) {
    await setSetting("rotatingUrl", String(body.rotatingUrl).trim());
  }
  if (body.rotationSeconds !== undefined) {
    const secs = Math.max(5, Math.min(3600, Number(body.rotationSeconds) || 30));
    await setSetting("rotationSeconds", String(secs));
  }
  if (body.rotatingEnabled !== undefined) {
    await setSetting("rotatingEnabled", body.rotatingEnabled ? "true" : "false");
  }
  if (body.scrollSpeed !== undefined) {
    const speed = Math.max(1, Math.min(10, Math.round(Number(body.scrollSpeed) || 4)));
    await setSetting("scrollSpeed", String(speed));
  }

  await logActivity("Settings", "Updated settings");
  const [dashboardName, rotation, scrollSpeed] = await Promise.all([
    getDashboardName(),
    getRotationConfig(),
    getScrollSpeed(),
  ]);
  return NextResponse.json({
    dashboardName,
    rotatingUrl: rotation.url,
    rotationSeconds: rotation.seconds,
    rotatingEnabled: rotation.enabled,
    scrollSpeed,
  });
}
