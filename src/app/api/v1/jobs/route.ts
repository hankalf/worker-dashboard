import { prisma } from "@/lib/prisma";
import {
  withApiKey,
  apiOk,
  apiError,
  readJson,
  logApi,
  type ApiContext,
} from "@/lib/apiAuth";

export const dynamic = "force-dynamic";

const STATUS = ["UNASSIGNED", "ASSIGNED", "IN_PROGRESS", "DONE"];

// GET /api/v1/jobs — open jobs by default, ?includeDone=1 for all.
export const GET = withApiKey("read", async (req: Request) => {
  const includeDone = new URL(req.url).searchParams.get("includeDone") === "1";
  const jobs = await prisma.job.findMany({
    where: includeDone ? undefined : { status: { not: "DONE" } },
    include: { assignedEmployee: { select: { id: true, name: true } } },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
  });
  return apiOk({
    jobs: jobs.map((j) => ({
      id: j.id,
      title: j.title,
      description: j.description,
      status: j.status,
      priority: j.priority,
      dueDate: j.dueDate,
      assignedEmployee: j.assignedEmployee,
    })),
  });
});

// POST /api/v1/jobs — create a job.
export const POST = withApiKey("jobs:write", async (req: Request, ctx: ApiContext) => {
  const parsed = await readJson<{
    title?: string;
    description?: string;
    status?: string;
    priority?: number;
    dueDate?: string | null;
    assignedEmployeeId?: string | null;
  }>(req);
  if ("response" in parsed) return parsed.response;
  const b = parsed.body;

  const title = typeof b.title === "string" ? b.title.trim() : "";
  if (!title) return apiError("bad_request", "`title` is required.", 400);
  if (b.status !== undefined && !STATUS.includes(b.status)) {
    return apiError("bad_request", `status must be one of ${STATUS.join(", ")}`, 400);
  }
  if (b.assignedEmployeeId) {
    const who = await prisma.employee.findFirst({
      where: { id: b.assignedEmployeeId, locationId: ctx.locationId },
    });
    // Scoped, so another location's employee reads as "not an employee" here
    // rather than being assignable — which would put their name on this board.
    if (!who) return apiError("bad_request", "assignedEmployeeId does not match an employee.", 400);
  }
  const due = b.dueDate ? new Date(b.dueDate) : null;
  if (b.dueDate && Number.isNaN(due!.getTime())) {
    return apiError("bad_request", "dueDate must be an ISO timestamp or null.", 400);
  }

  const job = await prisma.job.create({
    data: {
      title,
      description: b.description ?? null,
      // Assigning somebody implies the job is no longer unassigned, unless an
      // explicit status says otherwise.
      status: (b.status as never) ?? (b.assignedEmployeeId ? "ASSIGNED" : "UNASSIGNED"),
      priority: Number.isFinite(Number(b.priority)) ? Number(b.priority) : 0,
      dueDate: due,
      assignedEmployeeId: b.assignedEmployeeId ?? null,
    },
  });
  await logApi(ctx, "Job", `Created job "${job.title}" via API`, job.id);
  return apiOk({ job }, 201);
});
