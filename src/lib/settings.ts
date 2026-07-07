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
