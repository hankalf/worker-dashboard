import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import {
  getDashboardName,
  setDashboardName,
  setSetting,
  getRotationConfig,
  getScrollSpeed,
  getBranding,
  getShiftBounds,
  getLunchWindows,
  lunchWindowKey,
  parseHhmm,
} from "@/lib/settings";
import {
  SHIFT_KEYS as LUNCH_SHIFT_KEYS,
  windowProblem,
  WINDOW_PROBLEM_MESSAGE,
} from "@/lib/lunchWindow";

const isHexColor = (v: unknown): v is string =>
  typeof v === "string" && /^#[0-9a-fA-F]{3,8}$/.test(v);

export const dynamic = "force-dynamic";

// Public: current site settings (login page + rotating-dashboard editor).
export async function GET() {
  const [dashboardName, rotation, scrollSpeed, branding, shiftBounds, lunchWindows] =
    await Promise.all([
      getDashboardName(),
      getRotationConfig(),
      getScrollSpeed(),
      getBranding(),
      getShiftBounds(),
      getLunchWindows(),
    ]);
  return NextResponse.json({
    dashboardName,
    rotatingUrl: rotation.url,
    rotationSeconds: rotation.seconds,
    rotatingEnabled: rotation.enabled,
    rotatingDock: rotation.dock,
    rotatingDockHidden: rotation.dockHidden,
    scrollSpeed,
    branding,
    shiftBounds,
    lunchWindows,
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
  if (body.rotatingDock !== undefined) {
    await setSetting("rotatingDock", body.rotatingDock ? "true" : "false");
  }
  if (body.rotatingDockHidden !== undefined) {
    // Store only known tone keys, comma-separated.
    const allowed = ["active", "arrived", "scheduled", "requested", "done", "other"];
    const tones = String(body.rotatingDockHidden)
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => allowed.includes(s));
    await setSetting("rotatingDockHidden", tones.join(","));
  }
  if (body.scrollSpeed !== undefined) {
    const speed = Math.max(1, Math.min(10, Math.round(Number(body.scrollSpeed) || 4)));
    await setSetting("scrollSpeed", String(speed));
  }
  if (body.shift !== undefined) {
    // { firstStart, secondStart, thirdStart } as "HH:MM"; must be increasing.
    const s = body.shift ?? {};
    const f = parseHhmm(s.firstStart);
    const sec = parseHhmm(s.secondStart);
    const t = parseHhmm(s.thirdStart);
    if (f === null || sec === null || t === null) {
      return NextResponse.json(
        { error: "Shift times must be valid times (HH:MM)." },
        { status: 400 }
      );
    }
    if (!(f < sec && sec < t)) {
      return NextResponse.json(
        { error: "Shift start times must increase: 1st < 2nd < 3rd." },
        { status: 400 }
      );
    }
    await setSetting("shiftFirstStart", String(s.firstStart).trim());
    await setSetting("shiftSecondStart", String(s.secondStart).trim());
    await setSetting("shiftThirdStart", String(s.thirdStart).trim());
  }
  if (body.lunchWindows !== undefined) {
    // { FIRST: { start, end }, ... } as "HH:MM". A shift whose pair is blank
    // has its window cleared, which returns it to automatic placement.
    const w = body.lunchWindows ?? {};
    const writes: { key: string; value: string }[] = [];
    for (const shift of LUNCH_SHIFT_KEYS) {
      const pair = w[shift];
      if (pair === undefined) continue;
      const rawStart = String(pair?.start ?? "").trim();
      const rawEnd = String(pair?.end ?? "").trim();
      if (!rawStart && !rawEnd) {
        writes.push({ key: lunchWindowKey(shift, "Start"), value: "" });
        writes.push({ key: lunchWindowKey(shift, "End"), value: "" });
        continue;
      }
      const problem = windowProblem(parseHhmm(rawStart), parseHhmm(rawEnd));
      if (problem) {
        return NextResponse.json(
          { error: `${shift}: ${WINDOW_PROBLEM_MESSAGE[problem]}` },
          { status: 400 }
        );
      }
      writes.push({ key: lunchWindowKey(shift, "Start"), value: rawStart });
      writes.push({ key: lunchWindowKey(shift, "End"), value: rawEnd });
    }
    // Written only once every shift validated, so a bad 2nd-shift window can't
    // leave a half-saved 1st.
    for (const { key, value } of writes) await setSetting(key, value);
  }
  if (body.branding !== undefined) {
    const b = body.branding ?? {};
    // Colors: store a valid hex, or "" to clear (fall back to the default).
    const colorKeys: Record<string, string> = {
      headerBg: "brand.headerBg",
      headerFg: "brand.headerFg",
      notice: "brand.notice",
      handoff: "brand.handoff",
      badge: "brand.badge",
    };
    for (const [field, key] of Object.entries(colorKeys)) {
      if (b[field] !== undefined) {
        await setSetting(key, isHexColor(b[field]) ? b[field] : "");
      }
    }
    if (b.logo !== undefined) {
      const logo =
        typeof b.logo === "string" && b.logo.startsWith("data:image/")
          ? b.logo
          : "";
      if (logo.length > 400_000) {
        return NextResponse.json(
          { error: "Logo is too large — use an image under ~250 KB." },
          { status: 400 }
        );
      }
      await setSetting("brand.logo", logo);
    }
  }

  await logActivity("Settings", "Updated settings");
  const [dashboardName, rotation, scrollSpeed, branding, shiftBounds, lunchWindows] =
    await Promise.all([
      getDashboardName(),
      getRotationConfig(),
      getScrollSpeed(),
      getBranding(),
      getShiftBounds(),
      getLunchWindows(),
    ]);
  return NextResponse.json({
    dashboardName,
    rotatingUrl: rotation.url,
    rotationSeconds: rotation.seconds,
    rotatingEnabled: rotation.enabled,
    rotatingDock: rotation.dock,
    rotatingDockHidden: rotation.dockHidden,
    scrollSpeed,
    branding,
    shiftBounds,
    lunchWindows,
  });
}
