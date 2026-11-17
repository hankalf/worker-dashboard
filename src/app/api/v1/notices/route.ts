import { prisma } from "@/lib/prisma";
import { withApiKey, apiOk, apiError, readJson, logApi, type ApiContext } from "@/lib/apiAuth";

export const dynamic = "force-dynamic";

// GET /api/v1/notices — live and scheduled notices, oldest first.
export const GET = withApiKey("read", async () => {
  const notices = await prisma.announcement.findMany({ orderBy: { createdAt: "asc" } });
  return apiOk({ notices });
});

// POST /api/v1/notices — put a notice on the board.
export const POST = withApiKey("notices:write", async (req: Request, ctx: ApiContext) => {
  const parsed = await readJson<{
    message?: string;
    startsAt?: string | null;
    expiresAt?: string | null;
    pinned?: boolean;
    isEvent?: boolean;
  }>(req);
  if ("response" in parsed) return parsed.response;
  const b = parsed.body;

  const message = typeof b.message === "string" ? b.message.trim() : "";
  if (!message) return apiError("bad_request", "`message` is required.", 400);

  const when = (v: string | null | undefined, field: string) => {
    if (v == null || v === "") return { value: null as Date | null };
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) {
      return { error: `${field} must be an ISO timestamp or null.` };
    }
    return { value: d };
  };
  const starts = when(b.startsAt, "startsAt");
  if ("error" in starts) return apiError("bad_request", starts.error!, 400);
  const expires = when(b.expiresAt, "expiresAt");
  if ("error" in expires) return apiError("bad_request", expires.error!, 400);
  if (starts.value && expires.value && expires.value <= starts.value) {
    return apiError("bad_request", "expiresAt must be after startsAt.", 400);
  }

  const notice = await prisma.announcement.create({
    data: {
      message,
      startsAt: starts.value,
      expiresAt: expires.value,
      pinned: !!b.pinned,
      isEvent: !!b.isEvent,
    },
  });
  await logApi(ctx, "Notice", `Posted a notice via API`, notice.id);
  return apiOk({ notice }, 201);
});
