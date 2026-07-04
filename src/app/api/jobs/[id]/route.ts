import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/rbac";

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
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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
  await prisma.taskLog.create({
    data: {
      jobId: job.id,
      jobTitle: job.title,
      action: job.assignedEmployee
        ? `${base} — ${job.assignedEmployee.name}`
        : base,
    },
  });

  return NextResponse.json(job);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const job = await prisma.job.findUnique({ where: { id } });
  await prisma.job.delete({ where: { id } });

  if (job) {
    await prisma.taskLog.create({
      data: { jobId: null, jobTitle: job.title, action: "Deleted" },
    });
  }

  return NextResponse.json({ ok: true });
}
