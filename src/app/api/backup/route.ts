import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const SHIFT_LABEL: Record<string, string> = {
  FIRST: "1st Shift",
  SECOND: "2nd Shift",
  THIRD: "3rd Shift",
};

// Admin: download a full Excel snapshot of the warehouse data — one worksheet
// per dataset. passwordHash is omitted by the shared Prisma client, so logins
// aren't exported.
export async function GET() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [
    employees,
    positions,
    capabilities,
    equipment,
    jobs,
    announcements,
    shiftNotes,
    settings,
    headcountSnapshots,
    workHistory,
  ] = await Promise.all([
    prisma.employee.findMany({
      include: { position: true, roles: true, capabilities: true },
      orderBy: { name: "asc" },
    }),
    prisma.position.findMany({
      include: { requiredRole: true, requiredCapability: true },
      orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    }),
    prisma.capability.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.role.findMany({ orderBy: { name: "asc" } }),
    prisma.job.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.announcement.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.shiftNote.findMany(),
    prisma.setting.findMany(),
    prisma.headcountSnapshot.findMany({ orderBy: { date: "asc" } }),
    prisma.workHistory.findMany({ orderBy: { date: "asc" } }),
  ]);

  const wb = new ExcelJS.Workbook();
  wb.created = new Date();

  // Each sheet gets bold headers + a sensible column width.
  const addSheet = (
    name: string,
    columns: { header: string; key: string; width?: number }[],
    rows: Record<string, unknown>[]
  ) => {
    const ws = wb.addWorksheet(name);
    ws.columns = columns.map((c) => ({ ...c, width: c.width ?? 18 }));
    ws.getRow(1).font = { bold: true };
    ws.addRows(rows);
    return ws;
  };

  const iso = (d: Date | null | undefined) =>
    d ? new Date(d).toISOString().replace("T", " ").slice(0, 19) : "";

  addSheet(
    "Employees",
    [
      { header: "Name", key: "name", width: 24 },
      { header: "Shift", key: "shift" },
      { header: "Position", key: "position", width: 20 },
      { header: "Roles", key: "roles", width: 28 },
      { header: "Equipment", key: "equipment", width: 28 },
      { header: "Attendance", key: "attendance" },
      { header: "Lead", key: "lead", width: 8 },
      { header: "Lunch", key: "lunch", width: 10 },
      { header: "Break", key: "brk", width: 10 },
      { header: "Hire date", key: "hireDate", width: 12 },
      { header: "Birthday (MM-DD)", key: "birthDate", width: 16 },
      { header: "Access", key: "access", width: 12 },
      { header: "Username", key: "username", width: 16 },
      { header: "Terminated", key: "terminated", width: 20 },
    ],
    employees.map((e) => ({
      name: e.name,
      shift: e.shift ? SHIFT_LABEL[e.shift] : "",
      position: e.position?.title ?? "",
      roles: e.capabilities.map((c) => c.name).join("; "),
      equipment: e.roles.map((r) => r.name).join("; "),
      attendance: e.attendance,
      lead: e.isLead ? "Yes" : "",
      lunch: e.lunchStart ?? "",
      brk: e.breakStart ?? "",
      hireDate: e.hireDate ?? "",
      birthDate: e.birthDate ? e.birthDate.slice(5) : "",
      access: e.accessLevel === "NONE" ? "" : e.accessLevel,
      username: e.username ?? "",
      terminated: iso(e.terminatedAt),
    }))
  );

  addSheet(
    "Positions",
    [
      { header: "Title", key: "title", width: 24 },
      { header: "Description", key: "description", width: 40 },
      { header: "Required equipment", key: "requiredEquipment", width: 20 },
      { header: "Required role", key: "requiredRole", width: 20 },
      { header: "Min 1st", key: "minFirst", width: 8 },
      { header: "Min 2nd", key: "minSecond", width: 8 },
      { header: "Min 3rd", key: "minThird", width: 8 },
    ],
    positions.map((p) => ({
      title: p.title,
      description: p.description ?? "",
      requiredEquipment: p.requiredRole?.name ?? "",
      requiredRole: p.requiredCapability?.name ?? "",
      minFirst: p.minFirst,
      minSecond: p.minSecond,
      minThird: p.minThird,
    }))
  );

  addSheet(
    "Roles",
    [
      { header: "Name", key: "name", width: 24 },
      { header: "Description", key: "description", width: 40 },
    ],
    capabilities.map((c) => ({ name: c.name, description: c.description ?? "" }))
  );

  addSheet(
    "Equipment",
    [
      { header: "Name", key: "name", width: 24 },
      { header: "Description", key: "description", width: 40 },
    ],
    equipment.map((r) => ({ name: r.name, description: r.description ?? "" }))
  );

  const employeeName = new Map(employees.map((e) => [e.id, e.name]));
  addSheet(
    "Side Tasks",
    [
      { header: "Title", key: "title", width: 28 },
      { header: "Description", key: "description", width: 40 },
      { header: "Status", key: "status", width: 14 },
      { header: "Priority", key: "priority", width: 10 },
      { header: "Assigned to", key: "assignee", width: 22 },
      { header: "Due", key: "due", width: 12 },
    ],
    jobs.map((j) => ({
      title: j.title,
      description: j.description ?? "",
      status: j.status,
      priority: j.priority,
      assignee: j.assignedEmployeeId
        ? employeeName.get(j.assignedEmployeeId) ?? ""
        : "",
      due: j.dueDate ? iso(j.dueDate).slice(0, 10) : "",
    }))
  );

  addSheet(
    "Notices",
    [
      { header: "Message", key: "message", width: 60 },
      { header: "Pinned", key: "pinned", width: 8 },
      { header: "Starts", key: "starts", width: 20 },
      { header: "Expires", key: "expires", width: 20 },
      { header: "Created", key: "created", width: 20 },
    ],
    announcements.map((a) => ({
      message: a.message,
      pinned: a.pinned ? "Yes" : "",
      starts: iso(a.startsAt),
      expires: iso(a.expiresAt),
      created: iso(a.createdAt),
    }))
  );

  addSheet(
    "Shift Notes",
    [
      { header: "Shift", key: "shift", width: 12 },
      { header: "Note", key: "message", width: 60 },
      { header: "Updated", key: "updated", width: 20 },
    ],
    shiftNotes.map((n) => ({
      shift: SHIFT_LABEL[n.id] ?? n.id,
      message: n.message,
      updated: iso(n.updatedAt),
    }))
  );

  addSheet(
    "Headcount History",
    [
      { header: "Date", key: "date", width: 12 },
      { header: "Shift", key: "shift", width: 12 },
      { header: "Present", key: "present", width: 10 },
      { header: "Total", key: "total", width: 10 },
    ],
    headcountSnapshots.map((h) => ({
      date: h.date,
      shift: SHIFT_LABEL[h.shift] ?? h.shift,
      present: h.present,
      total: h.total,
    }))
  );

  addSheet(
    "Work History",
    [
      { header: "Date", key: "date", width: 12 },
      { header: "Employee", key: "employee", width: 24 },
      { header: "Position", key: "position", width: 20 },
    ],
    workHistory.map((w) => ({
      date: w.date,
      employee: w.employeeName,
      position: w.positionTitle,
    }))
  );

  addSheet(
    "Settings",
    [
      { header: "Key", key: "key", width: 24 },
      { header: "Value", key: "value", width: 50 },
    ],
    settings.map((s) => ({ key: s.key, value: s.value }))
  );

  const buffer = await wb.xlsx.writeBuffer();
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(new Uint8Array(buffer as ArrayBuffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="warehouse-backup-${date}.xlsx"`,
    },
  });
}
