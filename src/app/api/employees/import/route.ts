import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/rbac";
import { parseCsv } from "@/lib/csv";
import { logActivity } from "@/lib/activity";

// Expected CSV columns (header row required, in any order):
//   name        required
//   position    optional — created automatically if it doesn't exist
//   equipment   optional — semicolon-separated, created automatically
//   roles       optional — semicolon-separated job functions (Receive; Pick;
//               …), created automatically
//   admin       optional — "yes" grants admin access (requires username + password)
//   username    required when admin is yes
//   password    required when admin is yes
//   shift       optional — 1/2/3 (or 1st/2nd/3rd) for the work shift
//   hire_date   optional — "YYYY-MM-DD" (drives the anniversary badge)
//   birth_date  optional — "YYYY-MM-DD" (drives the birthday badge)
const SHIFT_MAP: Record<string, "FIRST" | "SECOND" | "THIRD"> = {
  "1": "FIRST",
  "1st": "FIRST",
  first: "FIRST",
  "2": "SECOND",
  "2nd": "SECOND",
  second: "SECOND",
  "3": "THIRD",
  "3rd": "THIRD",
  third: "THIRD",
};

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
      { error: "CSV needs a header row and at least one employee row" },
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

    const adminCell = get("admin").toLowerCase();
    const accessLevel: "NONE" | "SUPERVISOR" | "ADMIN" = [
      "yes",
      "true",
      "y",
      "1",
      "admin",
    ].includes(adminCell)
      ? "ADMIN"
      : adminCell === "supervisor"
        ? "SUPERVISOR"
        : "NONE";
    const username = get("username");
    const password = get("password");
    if (accessLevel !== "NONE" && (!username || !password)) {
      errors.push(`Row ${i + 1} (${name}): panel access requires username and password`);
      continue;
    }

    try {
      let positionId: string | null = null;
      const positionTitle = get("position");
      if (positionTitle) {
        const position = await prisma.position.upsert({
          where: { title: positionTitle },
          update: {},
          create: { title: positionTitle },
        });
        positionId = position.id;
      }

      const roleIds: string[] = [];
      for (const roleName of get("equipment").split(";").map((r) => r.trim()).filter(Boolean)) {
        const role = await prisma.role.upsert({
          where: { name: roleName },
          update: {},
          create: { name: roleName },
        });
        roleIds.push(role.id);
      }

      const capabilityIds: string[] = [];
      for (const capName of get("roles").split(";").map((r) => r.trim()).filter(Boolean)) {
        const cap = await prisma.capability.upsert({
          where: { name: capName },
          update: {},
          create: { name: capName },
        });
        capabilityIds.push(cap.id);
      }

      await prisma.employee.create({
        data: {
          name,
          positionId,
          accessLevel,
          username: username || null,
          passwordHash: password ? await bcrypt.hash(password, 10) : null,
          shift: SHIFT_MAP[get("shift").toLowerCase()] ?? null,
          hireDate: get("hire_date") || null,
          birthDate: get("birth_date") || null,
          roles: { connect: roleIds.map((id) => ({ id })) },
          capabilities: { connect: capabilityIds.map((id) => ({ id })) },
        },
      });
      created++;
    } catch (error) {
      const message =
        error instanceof Error && error.message.includes("Unique constraint")
          ? "username already in use"
          : "could not be saved";
      errors.push(`Row ${i + 1} (${name}): ${message}`);
    }
  }

  if (created > 0) {
    await logActivity(
      "Employee",
      `Imported ${created} employee${created === 1 ? "" : "s"} from CSV`
    );
  }

  return NextResponse.json({ created, errors });
}
