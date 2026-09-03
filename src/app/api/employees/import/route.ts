import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import { parseUpload, text } from "@/lib/sheet";
import {
  inferDateStyle,
  matchPosition,
  normalizeBirthday,
  normalizeDate,
  suggestPositions,
} from "@/lib/importValues";

// Accepts a .csv or a real .xlsx (see src/lib/sheet.ts). Expected columns
// (header row required, in any order):
//   name             required
//   employee_number  optional — payroll/badge number, free text
//   position         optional — MUST already exist; never created here
//   equipment        optional — semicolon-separated, created automatically
//   roles            optional — semicolon-separated job functions, created
//   misc1 / misc2    optional — admin-only free text
//   admin            optional — "yes" grants admin access (needs username+password)
//   username         required when admin is yes
//   password         required when admin is yes
//   shift            optional — 1/2/3 (or 1st/2nd/3rd)
//   hire_date        optional — any common format; normalized to YYYY-MM-DD
//   birth_date       optional — any common format; stored month/day only
//
// Positions are matched, not created. A cell that doesn't match an existing
// title comes back in `needsPositions` and NOTHING is imported until the
// caller resolves it and re-posts with `positionMap`. Importing the good rows
// first would strand the rest and make a re-upload create duplicates.
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

// Header aliases, so a spreadsheet saying "Employee #" or "Emp No" still lands.
const ALIASES: Record<string, string[]> = {
  name: ["name", "employee", "employee name", "full name"],
  employee_number: [
    "employee_number", "employee number", "employee #", "employee no",
    "emp number", "emp no", "emp #", "badge", "badge number", "payroll",
    "payroll number", "number", "id",
  ],
  position: ["position", "job", "job title", "title", "department"],
  equipment: ["equipment", "certifications", "certs"],
  roles: ["roles", "capabilities", "functions"],
  misc1: ["misc1", "misc 1", "misc", "note", "notes", "note1", "note 1"],
  misc2: ["misc2", "misc 2", "note2", "note 2"],
  admin: ["admin", "access", "access level"],
  username: ["username", "user", "login"],
  password: ["password", "pass"],
  shift: ["shift"],
  hire_date: ["hire_date", "hire date", "hired", "start date", "date hired"],
  birth_date: ["birth_date", "birth date", "birthday", "dob", "date of birth"],
};

export async function POST(req: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const rows = await parseUpload(body);
  if (!rows) {
    return NextResponse.json({ error: "No spreadsheet content provided" }, { status: 400 });
  }
  if (rows.length < 2) {
    return NextResponse.json(
      { error: "The file needs a header row and at least one employee row" },
      { status: 400 }
    );
  }
  // { "typed title": positionId } — "" means "import with no position".
  const positionMap: Record<string, string> =
    body.positionMap && typeof body.positionMap === "object" ? body.positionMap : {};

  const header = rows[0].map((h) => text(h).toLowerCase());
  const col = (field: string) => {
    for (const alias of ALIASES[field] ?? [field]) {
      const idx = header.indexOf(alias);
      if (idx !== -1) return idx;
    }
    return -1;
  };
  if (col("name") === -1) {
    return NextResponse.json(
      { error: 'The header row must include a "name" column' },
      { status: 400 }
    );
  }

  const dataRows = rows.slice(1);
  const cellAt = (row: unknown[], field: string) => {
    const idx = col(field);
    return idx === -1 ? "" : row[idx];
  };
  const strAt = (row: unknown[], field: string) => text(cellAt(row, field));

  // Decide date order once, from the whole column, so 03/04 and 25/12 in the
  // same file are read consistently rather than row by row.
  const hireStyle = inferDateStyle(dataRows.map((r) => cellAt(r, "hire_date")));
  const birthStyle = inferDateStyle(dataRows.map((r) => cellAt(r, "birth_date")));

  // ---- Pass 1: resolve positions before writing anything ------------------
  const positions = await prisma.position.findMany({ select: { id: true, title: true } });
  const resolved = new Map<string, string | null>();
  const unknown = new Map<string, { rows: number[]; suggestions: { id: string; title: string }[] }>();

  for (let i = 0; i < dataRows.length; i++) {
    const title = strAt(dataRows[i], "position");
    if (!title || resolved.has(title)) continue;
    // Seen before and still unresolved: just note the extra row number, so the
    // prompt can say which rows a typo affects.
    const seen = unknown.get(title);
    if (seen) {
      seen.rows.push(i + 2);
      continue;
    }
    const hit = matchPosition(title, positions);
    if (hit) {
      resolved.set(title, hit.id);
      continue;
    }
    // The caller has already told us what this one meant.
    if (Object.prototype.hasOwnProperty.call(positionMap, title)) {
      const chosen = positionMap[title];
      resolved.set(title, chosen && positions.some((p) => p.id === chosen) ? chosen : null);
      continue;
    }
    unknown.set(title, {
      rows: [i + 2],
      suggestions: suggestPositions(title, positions).map((p) => ({
        id: p.id,
        title: p.title,
      })),
    });
  }

  if (unknown.size > 0) {
    return NextResponse.json({
      created: 0,
      errors: [],
      needsPositions: [...unknown.entries()].map(([input, v]) => ({
        input,
        rows: v.rows,
        suggestions: v.suggestions,
      })),
      positions: positions.map((p) => ({ id: p.id, title: p.title })),
    });
  }

  // ---- Pass 2: write --------------------------------------------------------
  let created = 0;
  const errors: string[] = [];
  const fixedDates: string[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const cells = dataRows[i];
    const rowNo = i + 2;

    const name = strAt(cells, "name");
    if (!name) {
      errors.push(`Row ${rowNo}: missing name`);
      continue;
    }

    const adminCell = strAt(cells, "admin").toLowerCase();
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
    const username = strAt(cells, "username");
    const password = strAt(cells, "password");
    if (accessLevel !== "NONE" && (!username || !password)) {
      errors.push(`Row ${rowNo} (${name}): panel access requires username and password`);
      continue;
    }

    // Dates: whatever they typed, stored in the app's one format. Anything
    // unparseable is reported rather than silently dropped.
    const hireRaw = cellAt(cells, "hire_date");
    const hireDate = normalizeDate(hireRaw, hireStyle);
    if (!hireDate && text(hireRaw)) {
      errors.push(`Row ${rowNo} (${name}): hire date "${text(hireRaw)}" is not a date`);
      continue;
    }
    if (hireDate && text(hireRaw) !== hireDate) fixedDates.push(`${text(hireRaw)}→${hireDate}`);

    const birthRaw = cellAt(cells, "birth_date");
    const birthDate = normalizeBirthday(birthRaw, birthStyle);
    if (!birthDate && text(birthRaw)) {
      errors.push(`Row ${rowNo} (${name}): birth date "${text(birthRaw)}" is not a date`);
      continue;
    }

    try {
      const positionId = resolved.get(strAt(cells, "position")) ?? null;

      // Equipment and job functions ARE still created on demand: unlike a
      // position, a stray one does not reshape the board's columns.
      const roleIds: string[] = [];
      for (const roleName of strAt(cells, "equipment").split(";").map((r) => r.trim()).filter(Boolean)) {
        const role =
          (await prisma.role.findFirst({ where: { name: roleName } })) ??
          (await prisma.role.create({ data: { name: roleName } }));
        roleIds.push(role.id);
      }

      const capabilityIds: string[] = [];
      for (const capName of strAt(cells, "roles").split(";").map((r) => r.trim()).filter(Boolean)) {
        const cap =
          (await prisma.capability.findFirst({ where: { name: capName } })) ??
          (await prisma.capability.create({ data: { name: capName } }));
        capabilityIds.push(cap.id);
      }

      await prisma.employee.create({
        data: {
          name,
          employeeNumber: strAt(cells, "employee_number") || null,
          misc1: strAt(cells, "misc1") || null,
          misc2: strAt(cells, "misc2") || null,
          positionId,
          accessLevel,
          username: username || null,
          passwordHash: password ? await bcrypt.hash(password, 10) : null,
          shift: SHIFT_MAP[strAt(cells, "shift").toLowerCase()] ?? null,
          hireDate,
          birthDate,
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
      errors.push(`Row ${rowNo} (${name}): ${message}`);
    }
  }

  if (created > 0) {
    await logActivity(
      "Employee",
      `Imported ${created} employee${created === 1 ? "" : "s"} from a spreadsheet`
    );
  }

  return NextResponse.json({
    created,
    errors,
    // Surfaced so the admin can see what was reformatted rather than trusting it.
    datesReformatted: fixedDates.length,
  });
}
