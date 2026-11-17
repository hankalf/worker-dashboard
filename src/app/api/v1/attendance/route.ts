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

const ATTENDANCE = ["PRESENT", "ABSENT", "CALLED_OUT", "PTO"];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

type Entry = {
  id?: string;
  employeeNumber?: string;
  attendance?: string;
  lunchStart?: string | null;
  breakStart?: string | null;
  comingInAt?: string | null;
  stayOverUntil?: string | null;
};

// POST /api/v1/attendance — set today's status for one or many people.
//
// { entries: [ … ] } or a single object. Each entry names someone by `id` or
// `employeeNumber`. Only the fields present are changed, so sending just
// `attendance` leaves their lunch alone.
export const POST = withApiKey("attendance:write", async (req: Request, ctx: ApiContext) => {
  const parsed = await readJson<{ entries?: Entry[] } & Entry>(req);
  if ("response" in parsed) return parsed.response;
  const list: Entry[] = Array.isArray(parsed.body.entries)
    ? parsed.body.entries
    : [parsed.body as Entry];
  if (list.length === 0) {
    return apiError("bad_request", "Send `entries: [...]` or a single entry object.", 400);
  }
  if (list.length > 500) {
    return apiError("bad_request", "At most 500 entries per request.", 400);
  }

  const results: { index: number; id: string }[] = [];
  const errors: { index: number; error: string }[] = [];

  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    // Both lookups pin the location explicitly: a caller-supplied id from
    // another tenant must not resolve.
    const who = e.id
      ? await prisma.employee.findFirst({
          where: { id: e.id, locationId: ctx.locationId },
        })
      : e.employeeNumber
        ? await prisma.employee.findFirst({
            where: { employeeNumber: e.employeeNumber.trim(), locationId: ctx.locationId },
          })
        : null;
    if (!who) {
      errors.push({ index: i, error: "No matching employee (give `id` or `employeeNumber`)." });
      continue;
    }
    if (who.terminatedAt) {
      errors.push({ index: i, error: `${who.name} is terminated.` });
      continue;
    }
    if (e.attendance !== undefined && !ATTENDANCE.includes(e.attendance)) {
      errors.push({ index: i, error: `attendance must be one of ${ATTENDANCE.join(", ")}` });
      continue;
    }
    for (const [field, v] of [
      ["lunchStart", e.lunchStart],
      ["breakStart", e.breakStart],
    ] as const) {
      if (v != null && v !== "" && !HHMM.test(v)) {
        errors.push({ index: i, error: `${field} must be "HH:MM" (24-hour) or null` });
      }
    }
    if (errors.some((x) => x.index === i)) continue;

    const when = (v: string | null | undefined) => {
      if (v === undefined) return undefined;
      if (!v) return null;
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? undefined : d;
    };

    const data: Record<string, unknown> = {};
    if (e.attendance !== undefined) data.attendance = e.attendance;
    if (e.lunchStart !== undefined) {
      data.lunchStart = e.lunchStart || null;
      // Lunch is a fixed 30 minutes everywhere; an explicit end is cleared so
      // the board computes it the same way it does for every other path.
      data.lunchEnd = null;
    }
    if (e.breakStart !== undefined) data.breakStart = e.breakStart || null;
    if (e.comingInAt !== undefined) data.comingInAt = when(e.comingInAt);
    if (e.stayOverUntil !== undefined) data.stayOverUntil = when(e.stayOverUntil);

    if (Object.keys(data).length === 0) {
      errors.push({ index: i, error: "Nothing to change in this entry." });
      continue;
    }
    await prisma.employee.update({ where: { id: who.id }, data });
    results.push({ index: i, id: who.id });
  }

  if (results.length) {
    await logApi(ctx, "Attendance", `${results.length} attendance change(s) via API`);
  }
  return apiOk({ updated: results.length, results, errors }, errors.length ? 207 : 200);
});
