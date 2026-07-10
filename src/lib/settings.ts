import { prisma } from "@/lib/prisma";

// Editable site settings, stored as key/value rows in the Setting table.

export const DEFAULT_DASHBOARD_NAME = "Warehouse Dashboard";
const DASHBOARD_NAME_KEY = "dashboardName";

// The dashboard name shown across the public board, login page, browser tab,
// and admin panel. Falls back to the default if unset or if the table isn't
// there yet (e.g. before the migration runs) so the dashboard never crashes.
export async function getDashboardName(): Promise<string> {
  try {
    const row = await prisma.setting.findUnique({
      where: { key: DASHBOARD_NAME_KEY },
    });
    return row?.value?.trim() || DEFAULT_DASHBOARD_NAME;
  } catch {
    return DEFAULT_DASHBOARD_NAME;
  }
}

export async function setDashboardName(name: string): Promise<string> {
  const value = name.trim() || DEFAULT_DASHBOARD_NAME;
  await setSetting(DASHBOARD_NAME_KEY, value);
  return value;
}

// Generic key/value setter.
export async function setSetting(key: string, value: string): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

// Auto-scroll speed for the main dashboard's overflowing sections, as a 1–10
// slider value (default 4 ≈ the original 24px/s pace).
export async function getScrollSpeed(): Promise<number> {
  try {
    const row = await prisma.setting.findUnique({ where: { key: "scrollSpeed" } });
    const n = Number(row?.value);
    return n >= 1 && n <= 10 ? Math.round(n) : 4;
  } catch {
    return 4;
  }
}

// Branding / theme: an optional logo (stored as a data URL so it survives
// redeploys on hosts with an ephemeral filesystem) and a handful of accent
// colors. Empty string = "unset", so the default styling is used.
export type Branding = {
  logo: string;
  headerBg: string;
  headerFg: string;
  notice: string;
  handoff: string;
  badge: string;
};

const isHexColor = (v: unknown): v is string =>
  typeof v === "string" && /^#[0-9a-fA-F]{3,8}$/.test(v);

export async function getBranding(): Promise<Branding> {
  const empty: Branding = {
    logo: "",
    headerBg: "",
    headerFg: "",
    notice: "",
    handoff: "",
    badge: "",
  };
  try {
    const rows = await prisma.setting.findMany({
      where: { key: { startsWith: "brand." } },
    });
    const m = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    const color = (v: unknown) => (isHexColor(v) ? v : "");
    const logo =
      typeof m["brand.logo"] === "string" &&
      m["brand.logo"].startsWith("data:image/")
        ? m["brand.logo"]
        : "";
    return {
      logo,
      headerBg: color(m["brand.headerBg"]),
      headerFg: color(m["brand.headerFg"]),
      notice: color(m["brand.notice"]),
      handoff: color(m["brand.handoff"]),
      badge: color(m["brand.badge"]),
    };
  } catch {
    return empty;
  }
}

// Rotating-dashboard config: the public board can rotate between its own
// content and an external URL (shown in an iframe) on a timer.
export type RotationConfig = { url: string; seconds: number; enabled: boolean };

export async function getRotationConfig(): Promise<RotationConfig> {
  try {
    const rows = await prisma.setting.findMany({
      where: { key: { in: ["rotatingUrl", "rotationSeconds", "rotatingEnabled"] } },
    });
    const m = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return {
      url: m.rotatingUrl ?? "",
      seconds: Number(m.rotationSeconds) || 30,
      enabled: m.rotatingEnabled === "true",
    };
  } catch {
    return { url: "", seconds: 30, enabled: false };
  }
}
