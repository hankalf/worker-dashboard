import { prisma } from "@/lib/prisma";
import type { AccessLevel } from "@/lib/access";

// The admin panel navigation tabs. Labels/descriptions can be overridden by
// admins (stored in the Setting table as tab.<key>.name / tab.<key>.desc).
// `minAccess` is the lowest panel-access level that can see/use the tab.
export type TabDef = {
  key: string;
  label: string;
  href: string;
  group: "top" | "setup";
  minAccess: AccessLevel;
};

export type TabItem = TabDef & { description: string };

export const TABS: TabDef[] = [
  { key: "dashboard", label: "Admin Dashboard", href: "/admin", group: "top", minAccess: "LEAD" },
  { key: "notices", label: "Notices", href: "/admin/notices", group: "top", minAccess: "LEAD" },
  { key: "assign", label: "Assign", href: "/admin/assign", group: "top", minAccess: "LEAD" },
  { key: "lunches", label: "Lunches", href: "/admin/lunches", group: "top", minAccess: "LEAD" },
  { key: "jobs", label: "Side Tasks", href: "/admin/jobs", group: "top", minAccess: "LEAD" },
  { key: "attendance", label: "Attendance", href: "/admin/attendance", group: "top", minAccess: "SUPERVISOR" },
  { key: "general", label: "General", href: "/admin/settings", group: "setup", minAccess: "ADMIN" },
  { key: "employees", label: "Employees", href: "/admin/employees", group: "setup", minAccess: "ADMIN" },
  { key: "positions", label: "Positions", href: "/admin/positions", group: "setup", minAccess: "ADMIN" },
  { key: "roles", label: "Roles", href: "/admin/roles", group: "setup", minAccess: "ADMIN" },
  { key: "equipment", label: "Equipment", href: "/admin/equipment", group: "setup", minAccess: "ADMIN" },
  { key: "integrations", label: "Integrations", href: "/admin/integrations", group: "setup", minAccess: "ADMIN" },
  { key: "activity", label: "Activity", href: "/admin/activity", group: "setup", minAccess: "ADMIN" },
];

// Merge the defaults with any admin overrides from the Setting table.
export async function getTabs(): Promise<TabItem[]> {
  try {
    const rows = await prisma.setting.findMany({
      where: { key: { startsWith: "tab." } },
    });
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return TABS.map((t) => ({
      ...t,
      label: map[`tab.${t.key}.name`]?.trim() || t.label,
      description: map[`tab.${t.key}.desc`] ?? "",
    }));
  } catch {
    return TABS.map((t) => ({ ...t, description: "" }));
  }
}
