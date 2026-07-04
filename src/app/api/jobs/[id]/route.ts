import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/rbac";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const {
    title,
    description,
    tabId,
    assignedEmployeeId,
    status,
    dueDate,
    priority,
  } = await req.json();

  const job = await prisma.job.update({
    where: { id },
    data: {
      title,
      description,
      tabId,
      assignedEmployeeId: assignedEmployeeId || null,
      status,
      dueDate: dueDate ? new Date(dueDate) : null,
      priority,
    },
    include: { tab: true, assignedEmployee: true },
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
  await prisma.job.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
