import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/rbac";
import { easternDateKey } from "@/lib/time";

export const dynamic = "force-dynamic";

const csvCell = (v: string) =>
  /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;

const SHIFT_LABEL: Record<string, string> = {
  FIRST: "1",
  SECOND: "2",
  THIRD: "3",
};

// Columns mirror what POST /api/employees/import accepts, so an exported file
// can be edited and imported straight back. `password` is deliberately absent —
// only bcrypt hashes are stored and they are never exported; re-importing an
// admin row needs a fresh password.
// `terminated_at` is export-only — the import ignores columns it doesn't know,
// so a re-imported terminated employee comes back active.
const HEADER = [
  "name",
  "employee_number",
  "position",
  "equipment",
  "roles",
  "misc1",
  "misc2",
  "admin",
  "username",
  "shift",
  "hire_date",
  "birth_date",
  "terminated_at",
];

// Admin: download every employee for the current location as CSV, active and
// terminated alike. Active are listed first, each group alphabetically.
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const employees = await prisma.employee.findMany({
    include: {
      position: true,
      roles: { orderBy: { name: "asc" } },
      capabilities: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
    },
    orderBy: { name: "asc" },
  });

  // Sorted here rather than in the query so "active first" doesn't depend on
  // how the database orders NULLs.
  const ordered = [
    ...employees.filter((e) => !e.terminatedAt),
    ...employees.filter((e) => e.terminatedAt),
  ];

  const rows = ordered.map((e) => [
    e.name,
    e.employeeNumber ?? "",
    e.position?.title ?? "",
    // Semicolon-separated, matching the import's format for multi-value cells.
    e.roles.map((r) => r.name).join("; "),
    e.capabilities.map((c) => c.name).join("; "),
    e.misc1 ?? "",
    e.misc2 ?? "",
    e.accessLevel === "ADMIN" ? "yes" : "",
    e.username ?? "",
    e.shift ? (SHIFT_LABEL[e.shift] ?? "") : "",
    e.hireDate ?? "",
    e.birthDate ?? "",
    // Warehouse-local date, so a late-evening termination doesn't read as the
    // next day the way a raw UTC timestamp would.
    e.terminatedAt ? easternDateKey(e.terminatedAt) : "",
  ]);

  const csv = [HEADER, ...rows]
    .map((r) => r.map(csvCell).join(","))
    .join("\n");

  const stamp = new Date().toISOString().slice(0, 10);
  // Leading BOM so Excel opens UTF-8 names correctly.
  return new NextResponse("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="employees-${stamp}.csv"`,
    },
  });
}
