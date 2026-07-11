import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import { isScheduleDate } from "@/lib/schedule";

// POST /api/schedule/copy — copy a set of position assignments into an upcoming
// date's plan (replacing whatever was there). { from: "today" | "YYYY-MM-DD",
// to: "YYYY-MM-DD" }. "today" copies the current live board so a day can start
// from where everyone is now; a date copies that day's plan to the next.
export async function POST(req: Request) {
  const staff = await requireStaff();
  if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { from, to } = await req.json();
  if (!isScheduleDate(to))
    return NextResponse.json({ error: "Target date out of range" }, { status: 400 });
  if (from !== "today" && !isScheduleDate(from))
    return NextResponse.json({ error: "Source out of range" }, { status: 400 });
  if (from === to)
    return NextResponse.json({ error: "Source and target are the same" }, { status: 400 });

  // Gather source assignments as { employeeId, positionId } with a real position.
  let source: { employeeId: string; positionId: string }[];
  if (from === "today") {
    const emps = await prisma.employee.findMany({
      where: { terminatedAt: null, NOT: { positionId: null } },
      select: { id: true, positionId: true },
    });
    source = emps.map((e) => ({ employeeId: e.id, positionId: e.positionId! }));
  } else {
    const rows = await prisma.scheduledAssignment.findMany({
      where: { date: from, NOT: { positionId: null } },
      select: { employeeId: true, positionId: true },
    });
    source = rows.map((r) => ({ employeeId: r.employeeId, positionId: r.positionId! }));
  }

  // Replace the target day's plan with the copied assignments, atomically.
  await prisma.$transaction([
    prisma.scheduledAssignment.deleteMany({ where: { date: to } }),
    ...source.map((s) =>
      prisma.scheduledAssignment.create({
        data: { date: to, employeeId: s.employeeId, positionId: s.positionId },
      })
    ),
  ]);

  await logActivity(
    "Schedule",
    `Copied ${source.length} assignment(s) ${from === "today" ? "from today" : `from ${from}`} to ${to}`
  );

  const rows = await prisma.scheduledAssignment.findMany({
    where: { date: to },
    select: { employeeId: true, positionId: true },
  });
  return NextResponse.json(rows);
}
