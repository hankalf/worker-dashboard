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
  await prisma.setting.upsert({
    where: { key: DASHBOARD_NAME_KEY },
    update: { value },
    create: { key: DASHBOARD_NAME_KEY, value },
  });
  return value;
}
