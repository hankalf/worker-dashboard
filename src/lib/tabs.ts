import { prisma } from "@/lib/prisma";

// The admin panel navigation tabs. Labels/descriptions can be overridden by
// admins (stored in the Setting table as tab.<key>.name / tab.<key>.desc).
export type TabDef = {
  key: string;
  label: string;
  href: string;
  group: "top" | "setup";
  adminOnly: boolean;
};

export type TabItem = TabDef & { description: string };

export const TABS: TabDef[] = [
  { key: "dashboard", label: "Admin Dashboard", href: "/admin", group: "top", adminOnly: false },
  { key: "notices", label: "Notices", href: "/admin/notices", group: "top", adminOnly: false },
  { key: "assign", label: "Assign", href: "/admin/assign", group: "top", adminOnly: false },
  { key: "jobs", label: "Side Tasks", href: "/admin/jobs", group: "top", adminOnly: false },
  { key: "attendance", label: "Attendance", href: "/admin/attendance", group: "top", adminOnly: true },
  { key: "general", label: "General", href: "/admin/settings", group: "setup", adminOnly: true },
  { key: "employees", label: "Employees", href: "/admin/employees", group: "setup", adminOnly: true },
  { key: "positions", label: "Positions", href: "/admin/positions", group: "setup", adminOnly: true },
  { key: "roles", label: "Roles", href: "/admin/roles", group: "setup", adminOnly: true },
  { key: "equipment", label: "Equipment", href: "/admin/equipment", group: "setup", adminOnly: true },
  { key: "activity", label: "Activity", href: "/admin/activity", group: "setup", adminOnly: true },
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
