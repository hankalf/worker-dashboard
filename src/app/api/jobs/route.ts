import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";

export async function GET() {
  const jobs = await prisma.job.findMany({
    include: { assignedEmployee: { include: { position: true } } },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
  });
  return NextResponse.json(jobs);
}

export async function POST(req: Request) {
  const staff = await requireStaff();
  if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { title, description, assignedEmployeeId, status, dueDate, priority } =
    await req.json();
  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  const validStatuses = ["UNASSIGNED", "ASSIGNED", "IN_PROGRESS", "DONE"];
  const defaultStatus = assignedEmployeeId ? "ASSIGNED" : "UNASSIGNED";

  const job = await prisma.job.create({
    data: {
      title,
      description,
      assignedEmployeeId: assignedEmployeeId || null,
      status: validStatuses.includes(status) && status !== "UNASSIGNED"
        ? status
        : defaultStatus,
      dueDate: dueDate ? new Date(dueDate) : null,
      priority: priority ?? 0,
    },
    include: { assignedEmployee: true },
  });

  const createdAction = job.assignedEmployee
    ? `Created and assigned to ${job.assignedEmployee.name}`
    : "Created";
  await prisma.taskLog.create({
    data: { jobId: job.id, jobTitle: job.title, action: createdAction },
  });
  await logActivity("Side Task", `${job.title}: ${createdAction}`);

  return NextResponse.json(job, { status: 201 });
}
