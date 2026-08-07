import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/rbac";

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
const HEADER = [
  "name",
  "position",
  "equipment",
  "roles",
  "admin",
  "username",
  "shift",
  "hire_date",
  "birth_date",
];

// Admin: download every active employee for the current location as CSV.
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const employees = await prisma.employee.findMany({
    where: { terminatedAt: null },
    include: {
      position: true,
      roles: { orderBy: { name: "asc" } },
      capabilities: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
    },
    orderBy: { name: "asc" },
  });

  const rows = employees.map((e) => [
    e.name,
    e.position?.title ?? "",
    // Semicolon-separated, matching the import's format for multi-value cells.
    e.roles.map((r) => r.name).join("; "),
    e.capabilities.map((c) => c.name).join("; "),
    e.accessLevel === "ADMIN" ? "yes" : "",
    e.username ?? "",
    e.shift ? (SHIFT_LABEL[e.shift] ?? "") : "",
    e.hireDate ?? "",
    e.birthDate ?? "",
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
