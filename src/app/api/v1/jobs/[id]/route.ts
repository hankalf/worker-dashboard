import { prisma } from "@/lib/prisma";
import { withApiKey, apiOk, apiError, readJson, logApi, type ApiContext } from "@/lib/apiAuth";

export const dynamic = "force-dynamic";

const STATUS = ["UNASSIGNED", "ASSIGNED", "IN_PROGRESS", "DONE"];

// Next passes route params as a promise; the id is read from the URL so the
// handler keeps the single-argument shape withApiKey wraps.
const idFrom = (req: Request) => {
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "";
};

// PATCH /api/v1/jobs/{id} — change a job. Only the fields sent are touched.
export const PATCH = withApiKey("jobs:write", async (req: Request, ctx: ApiContext) => {
  const id = idFrom(req);
  // findFirst with an explicit locationId: a job id from another warehouse is
  // not found rather than editable.
  const existing = await prisma.job.findFirst({
    where: { id, locationId: ctx.locationId },
  });
  if (!existing) return apiError("not_found", "No job with that id.", 404);

  const parsed = await readJson<{
    title?: string;
    description?: string | null;
    status?: string;
    priority?: number;
    dueDate?: string | null;
    assignedEmployeeId?: string | null;
  }>(req);
  if ("response" in parsed) return parsed.response;
  const b = parsed.body;

  if (b.status !== undefined && !STATUS.includes(b.status)) {
    return apiError("bad_request", `status must be one of ${STATUS.join(", ")}`, 400);
  }
  if (b.assignedEmployeeId) {
    const who = await prisma.employee.findFirst({
      where: { id: b.assignedEmployeeId, locationId: ctx.locationId },
    });
    if (!who) return apiError("bad_request", "assignedEmployeeId does not match an employee.", 400);
  }

  const data: Record<string, unknown> = {};
  if (b.title !== undefined) data.title = String(b.title).trim();
  if (b.description !== undefined) data.description = b.description ?? null;
  if (b.status !== undefined) data.status = b.status;
  if (b.priority !== undefined) data.priority = Number(b.priority) || 0;
  if (b.dueDate !== undefined) {
    const d = b.dueDate ? new Date(b.dueDate) : null;
    if (b.dueDate && Number.isNaN(d!.getTime())) {
      return apiError("bad_request", "dueDate must be an ISO timestamp or null.", 400);
    }
    data.dueDate = d;
  }
  if (b.assignedEmployeeId !== undefined) {
    data.assignedEmployeeId = b.assignedEmployeeId ?? null;
    // Unassigning a job that was only "assigned" puts it back in the pool
    // rather than leaving it claiming an owner it no longer has.
    if (!b.assignedEmployeeId && b.status === undefined && existing.status === "ASSIGNED") {
      data.status = "UNASSIGNED";
    }
  }
  if (Object.keys(data).length === 0) {
    return apiError("bad_request", "Nothing to change.", 400);
  }

  const job = await prisma.job.update({ where: { id }, data });
  await logApi(ctx, "Job", `Updated job "${job.title}" via API`, job.id);
  return apiOk({ job });
});

// DELETE /api/v1/jobs/{id}
export const DELETE = withApiKey("jobs:write", async (req: Request, ctx: ApiContext) => {
  const id = idFrom(req);
  const existing = await prisma.job.findFirst({
    where: { id, locationId: ctx.locationId },
  });
  if (!existing) return apiError("not_found", "No job with that id.", 404);
  await prisma.job.delete({ where: { id } });
  await logApi(ctx, "Job", `Deleted job "${existing.title}" via API`, id);
  return apiOk({ deleted: id });
});
