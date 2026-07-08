import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import { isScheduleDate } from "@/lib/schedule";

// GET /api/schedule?date=YYYY-MM-DD — the planned assignments for one upcoming
// date, as [{ employeeId, positionId }]. Staff only.
export async function GET(req: Request) {
  const staff = await requireStaff();
  if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const date = new URL(req.url).searchParams.get("date") ?? "";
  if (!isScheduleDate(date)) return NextResponse.json([]);

  const rows = await prisma.scheduledAssignment.findMany({
    where: { date },
    select: { employeeId: true, positionId: true },
  });
  return NextResponse.json(rows);
}

// PUT /api/schedule — upsert one employee's planned position for a date.
// { date, employeeId, positionId }. Empty positionId clears the plan row.
export async function PUT(req: Request) {
  const staff = await requireStaff();
  if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { date, employeeId, positionId } = await req.json();
  if (!isScheduleDate(date))
    return NextResponse.json({ error: "Date out of range" }, { status: 400 });
  if (!employeeId)
    return NextResponse.json({ error: "employeeId required" }, { status: 400 });

  if (positionId) {
    await prisma.scheduledAssignment.upsert({
      where: { employeeId_date: { employeeId, date } },
      update: { positionId },
      create: { employeeId, date, positionId },
    });
  } else {
    await prisma.scheduledAssignment.deleteMany({ where: { employeeId, date } });
  }
  return NextResponse.json({ ok: true });
}

// DELETE /api/schedule?date=YYYY-MM-DD — clear the whole plan for one date.
export async function DELETE(req: Request) {
  const staff = await requireStaff();
  if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const date = new URL(req.url).searchParams.get("date") ?? "";
  if (!isScheduleDate(date))
    return NextResponse.json({ error: "Date out of range" }, { status: 400 });

  const { count } = await prisma.scheduledAssignment.deleteMany({
    where: { date },
  });
  if (count > 0)
    await logActivity("Schedule", `Cleared plan for ${date} (${count})`);
  return NextResponse.json({ ok: true });
}
