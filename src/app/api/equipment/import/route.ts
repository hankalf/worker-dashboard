import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/rbac";
import { parseCsv } from "@/lib/csv";
import { logActivity } from "@/lib/activity";

// CSV columns: name (required), description (optional). "Equipment" = Role.
export async function POST(req: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { csv } = await req.json();
  if (typeof csv !== "string" || !csv.trim()) {
    return NextResponse.json({ error: "No CSV content provided" }, { status: 400 });
  }
  const rows = parseCsv(csv);
  if (rows.length < 2) {
    return NextResponse.json(
      { error: "CSV needs a header row and at least one row" },
      { status: 400 }
    );
  }
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  if (col("name") === -1) {
    return NextResponse.json(
      { error: 'CSV header must include a "name" column' },
      { status: 400 }
    );
  }

  let created = 0;
  let updated = 0;
  const errors: string[] = [];

  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];
    const get = (name: string) => {
      const idx = col(name);
      return idx === -1 ? "" : (cells[idx] ?? "").trim();
    };
    const name = get("name");
    if (!name) {
      errors.push(`Row ${i + 1}: missing name`);
      continue;
    }
    try {
      const existing = await prisma.role.findUnique({ where: { name } });
      if (existing) {
        await prisma.role.update({
          where: { name },
          data: { description: get("description") || existing.description },
        });
        updated++;
      } else {
        await prisma.role.create({
          data: { name, description: get("description") || null },
        });
        created++;
      }
    } catch {
      errors.push(`Row ${i + 1} (${name}): could not be saved`);
    }
  }

  if (created || updated) {
    await logActivity(
      "Equipment",
      `Imported equipment (${created} new, ${updated} updated)`
    );
  }
  return NextResponse.json({ created, updated, errors });
}
