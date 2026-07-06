import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/rbac";
import { parseCsv } from "@/lib/csv";
import { logActivity } from "@/lib/activity";

// CSV columns (header required, any order):
//   title        required — matched to an existing position or created
//   description  optional
//   equipment    optional — required-equipment name (created if new)
//   role         optional — required-role (job function) name (created if new)
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
  if (col("title") === -1) {
    return NextResponse.json(
      { error: 'CSV header must include a "title" column' },
      { status: 400 }
    );
  }

  let created = 0;
  let updated = 0;
  const errors: string[] = [];
  let nextSort = await prisma.position.count();

  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];
    const get = (name: string) => {
      const idx = col(name);
      return idx === -1 ? "" : (cells[idx] ?? "").trim();
    };
    const title = get("title");
    if (!title) {
      errors.push(`Row ${i + 1}: missing title`);
      continue;
    }
    try {
      let requiredRoleId: string | null = null;
      const eq = get("equipment");
      if (eq) {
        const r = await prisma.role.upsert({
          where: { name: eq },
          update: {},
          create: { name: eq },
        });
        requiredRoleId = r.id;
      }
      let requiredCapabilityId: string | null = null;
      const role = get("role");
      if (role) {
        const c = await prisma.capability.upsert({
          where: { name: role },
          update: {},
          create: { name: role },
        });
        requiredCapabilityId = c.id;
      }

      const existing = await prisma.position.findUnique({ where: { title } });
      if (existing) {
        await prisma.position.update({
          where: { title },
          data: {
            description: get("description") || existing.description,
            requiredRoleId: requiredRoleId ?? existing.requiredRoleId,
            requiredCapabilityId:
              requiredCapabilityId ?? existing.requiredCapabilityId,
          },
        });
        updated++;
      } else {
        await prisma.position.create({
          data: {
            title,
            description: get("description") || null,
            requiredRoleId,
            requiredCapabilityId,
            sortOrder: nextSort++,
          },
        });
        created++;
      }
    } catch {
      errors.push(`Row ${i + 1} (${title}): could not be saved`);
    }
  }

  if (created || updated) {
    await logActivity(
      "Position",
      `Imported positions (${created} new, ${updated} updated)`
    );
  }
  return NextResponse.json({ created, updated, errors });
}
