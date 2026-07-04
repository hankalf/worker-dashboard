import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/rbac";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const tabId = searchParams.get("tabId");

  const jobs = await prisma.job.findMany({
    where: tabId ? { tabId } : undefined,
    include: { tab: true, assignedEmployee: { include: { position: true } } },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
  });
  return NextResponse.json(jobs);
}

export async function POST(req: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { title, description, tabId, assignedEmployeeId, status, dueDate, priority } =
    await req.json();
  if (!title || !tabId) {
    return NextResponse.json(
      { error: "Title and tab are required" },
      { status: 400 }
    );
  }

  const validStatuses = ["UNASSIGNED", "ASSIGNED", "IN_PROGRESS", "DONE"];
  const defaultStatus = assignedEmployeeId ? "ASSIGNED" : "UNASSIGNED";

  const job = await prisma.job.create({
    data: {
      title,
      description,
      tabId,
      assignedEmployeeId: assignedEmployeeId || null,
      status: validStatuses.includes(status) && status !== "UNASSIGNED"
        ? status
        : defaultStatus,
      dueDate: dueDate ? new Date(dueDate) : null,
      priority: priority ?? 0,
    },
    include: { tab: true, assignedEmployee: true },
  });
  return NextResponse.json(job, { status: 201 });
}
