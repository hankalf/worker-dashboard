// The guard every /api/v1 route goes through.
//
// Two things matter here and they are easy to get wrong separately:
//
//   1. The key decides the tenant. A key belongs to one location and the
//      handler runs inside runWithLocation(), which pins every query the
//      Prisma extension scopes — collection reads, bulk writes, creates.
//
//      It does NOT pin findUnique/update/delete keyed by id: the extension
//      skips those deliberately (see src/lib/prisma.ts). That is fine for the
//      admin UI, where a human only ever holds ids from their own location,
//      and wrong here, where the caller supplies the id and could name another
//      tenant's row. So every v1 handler looks a caller-supplied id up with
//      findFirst and an explicit locationId, never findUnique. A cross-tenant
//      id then simply is not found. There is a test for this.
//
//   2. The key decides what may be done. A scope is checked before the handler
//      runs, not inside it, so a new route cannot forget to check.

import { NextResponse } from "next/server";
import { prisma, runWithLocation } from "@/lib/prisma";
import {
  keyFromRequest,
  resolveKey,
  touchKey,
  type ResolvedKey,
  type Scope,
} from "@/lib/apiKey";

export type ApiContext = ResolvedKey;

const json = (body: unknown, status: number) =>
  NextResponse.json(body, { status });

// Errors carry a stable `error` code plus a human `message`, so the calling
// app can branch on the code and a person reading a log can tell what happened.
export const apiError = (
  code: string,
  message: string,
  status: number,
  extra?: Record<string, unknown>
) => json({ error: code, message, ...extra }, status);

export const apiOk = (body: unknown, status = 200) => json(body, status);

// Wrap a v1 handler: authenticate, check the scope, pin the location, run.
export function withApiKey(
  scope: Scope,
  handler: (req: Request, ctx: ApiContext) => Promise<Response>
) {
  return async (req: Request): Promise<Response> => {
    const key = await resolveKey(keyFromRequest(req));
    if (!key) {
      return apiError(
        "unauthorized",
        "Missing or invalid API key. Send it as `Authorization: Bearer <key>` or `X-API-Key: <key>`.",
        401
      );
    }
    if (!key.scopes.includes(scope)) {
      return apiError(
        "forbidden",
        `This key does not have the "${scope}" scope.`,
        403,
        { required: scope, granted: key.scopes }
      );
    }
    // Fire-and-forget: a slow stamp must not slow the request down, and a
    // failed one must not fail it.
    void touchKey(key.id);

    try {
      return await runWithLocation(key.locationId, () => handler(req, key));
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unexpected error";
      // Prisma's unique-constraint code, surfaced as something actionable.
      if ((e as { code?: string }).code === "P2002") {
        return apiError("conflict", `Already exists: ${message}`, 409);
      }
      console.error("[api/v1]", message);
      return apiError("server_error", "The request could not be completed.", 500);
    }
  };
}

// Parse a JSON body, or return the error response to send back.
export async function readJson<T = Record<string, unknown>>(
  req: Request
): Promise<{ body: T } | { response: Response }> {
  try {
    const body = await req.json();
    if (body === null || typeof body !== "object") {
      return { response: apiError("bad_request", "Body must be a JSON object.", 400) };
    }
    return { body: body as T };
  } catch {
    return { response: apiError("bad_request", "Body must be valid JSON.", 400) };
  }
}

// Record what a key changed. Everything an API key does is attributed to it by
// name, so the activity log reads "Central ops app: …" rather than appearing
// to happen by itself.
export async function logApi(
  ctx: ApiContext,
  category: string,
  action: string,
  subjectId?: string
): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: {
        category,
        action: `${ctx.name}: ${action}`,
        actorName: `API key (${ctx.name})`,
        subjectId: subjectId ?? null,
      },
    });
  } catch {
    /* logging must never fail a write */
  }
}
