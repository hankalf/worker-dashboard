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

const SHIFTS = ["FIRST", "SECOND", "THIRD"];

// GET /api/v1/employees — the roster. ?includeTerminated=1 for everyone.
export const GET = withApiKey("read", async (req: Request) => {
  const includeTerminated =
    new URL(req.url).searchParams.get("includeTerminated") === "1";
  const employees = await prisma.employee.findMany({
    where: includeTerminated ? undefined : { terminatedAt: null },
    include: { position: true },
    orderBy: { name: "asc" },
  });
  return apiOk({
    employees: employees.map((e) => ({
      id: e.id,
      name: e.name,
      employeeNumber: e.employeeNumber,
      position: e.position ? { id: e.position.id, title: e.position.title } : null,
      shift: e.shift,
      attendance: e.attendance,
      isLead: e.isLead,
      lunchStart: e.lunchStart,
      breakStart: e.breakStart,
      terminatedAt: e.terminatedAt,
    })),
  });
});

type Incoming = {
  id?: string;
  employeeNumber?: string;
  name?: string;
  position?: string;
  shift?: string | null;
  isLead?: boolean;
  misc1?: string | null;
  misc2?: string | null;
  terminated?: boolean;
};

// POST /api/v1/employees — upsert one or many.
//
// { employees: [ … ] } or a single object. Each is matched by `id`, else by
// `employeeNumber`, else created. Positions are matched by title and never
// created, the same rule the spreadsheet import and the Monday sync follow:
// one typo must not add a column to the board everyone looks at.
export const POST = withApiKey("employees:write", async (req: Request, ctx: ApiContext) => {
  const parsed = await readJson<{ employees?: Incoming[] } & Incoming>(req);
  if ("response" in parsed) return parsed.response;
  const list: Incoming[] = Array.isArray(parsed.body.employees)
    ? parsed.body.employees
    : [parsed.body as Incoming];
  if (list.length === 0) {
    return apiError("bad_request", "Send `employees: [...]` or a single employee object.", 400);
  }
  if (list.length > 500) {
    return apiError("bad_request", "At most 500 employees per request.", 400);
  }

  const positions = await prisma.position.findMany({ select: { id: true, title: true } });
  const fold = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const positionIdFor = (title?: string) =>
    title ? (positions.find((p) => fold(p.title) === fold(title))?.id ?? null) : undefined;

  const results: { index: number; id?: string; action: string; warning?: string }[] = [];
  const errors: { index: number; error: string }[] = [];

  for (let i = 0; i < list.length; i++) {
    const raw = list[i];
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    const number = typeof raw.employeeNumber === "string" ? raw.employeeNumber.trim() : "";

    // findFirst with an explicit locationId, never findUnique: an id from
    // another location must not be reachable with this key.
    let existing = raw.id
      ? await prisma.employee.findFirst({
          where: { id: raw.id, locationId: ctx.locationId },
        })
      : null;
    if (raw.id && !existing) {
      errors.push({ index: i, error: `No employee with id ${raw.id}` });
      continue;
    }
    if (!existing && number) {
      existing = await prisma.employee.findFirst({
        where: { employeeNumber: number, locationId: ctx.locationId },
      });
    }
    if (!existing && !name) {
      errors.push({ index: i, error: "A new employee needs a name." });
      continue;
    }
    if (raw.shift != null && raw.shift !== "" && !SHIFTS.includes(raw.shift)) {
      errors.push({ index: i, error: `shift must be one of ${SHIFTS.join(", ")} (or null)` });
      continue;
    }

    const posId = positionIdFor(raw.position);
    const warning =
      raw.position && posId === null
        ? `Position "${raw.position}" does not exist here — saved with no position.`
        : undefined;

    // Only fields actually present are written, so a partial payload does not
    // blank out everything it left out.
    const data: Record<string, unknown> = {};
    if (name) data.name = name;
    if (number) data.employeeNumber = number;
    if (raw.position !== undefined) data.positionId = posId ?? null;
    if (raw.shift !== undefined) data.shift = raw.shift || null;
    if (raw.isLead !== undefined) data.isLead = !!raw.isLead;
    if (raw.misc1 !== undefined) data.misc1 = raw.misc1 || null;
    if (raw.misc2 !== undefined) data.misc2 = raw.misc2 || null;
    if (raw.terminated !== undefined) {
      if (raw.terminated) {
        // Matches the Terminate button, so Reactivate behaves identically.
        Object.assign(data, {
          terminatedAt: new Date(),
          accessLevel: "NONE",
          positionId: null,
          isLead: false,
        });
      } else {
        data.terminatedAt = null;
      }
    }

    if (existing) {
      // An API key must not be a way to escalate: a login account's access
      // level is never touched from here.
      await prisma.employee.update({ where: { id: existing.id }, data });
      results.push({ index: i, id: existing.id, action: "updated", warning });
    } else {
      const created = await prisma.employee.create({
        data: { name, ...data },
      });
      results.push({ index: i, id: created.id, action: "created", warning });
    }
  }

  const created = results.filter((r) => r.action === "created").length;
  const updated = results.filter((r) => r.action === "updated").length;
  if (created || updated) {
    await logApi(ctx, "Employee", `${created} created, ${updated} updated via API`);
  }
  return apiOk({ created, updated, results, errors }, errors.length ? 207 : 200);
});
