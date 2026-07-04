import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";

const STATUS_ACTIONS: Record<string, string> = {
  UNASSIGNED: "Unassigned",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "Marked in progress",
  DONE: "Completed",
};

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const staff = await requireStaff();
  if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const { title, description, assignedEmployeeId, status, dueDate, priority } =
    await req.json();

  const job = await prisma.job.update({
    where: { id },
    data: {
      title,
      description,
      assignedEmployeeId: assignedEmployeeId || null,
      status,
      dueDate: dueDate ? new Date(dueDate) : null,
      priority,
    },
    include: { assignedEmployee: true },
  });

  const base = STATUS_ACTIONS[job.status] ?? "Updated";
  const action = job.assignedEmployee
    ? `${base} — ${job.assignedEmployee.name}`
    : base;
  await prisma.taskLog.create({
    data: { jobId: job.id, jobTitle: job.title, action },
  });
  await logActivity("Side Task", `${job.title}: ${action}`);

  return NextResponse.json(job);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const staff = await requireStaff();
  if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const job = await prisma.job.findUnique({ where: { id } });
  await prisma.job.delete({ where: { id } });

  if (job) {
    await prisma.taskLog.create({
      data: { jobId: null, jobTitle: job.title, action: "Deleted" },
    });
    await logActivity("Side Task", `${job.title}: Deleted`);
  }

  return NextResponse.json({ ok: true });
}
