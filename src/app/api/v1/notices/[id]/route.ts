import { prisma } from "@/lib/prisma";
import { withApiKey, apiOk, apiError, logApi, type ApiContext } from "@/lib/apiAuth";

export const dynamic = "force-dynamic";

const idFrom = (req: Request) => {
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "";
};

// DELETE /api/v1/notices/{id} — take a notice off the board.
export const DELETE = withApiKey("notices:write", async (req: Request, ctx: ApiContext) => {
  const id = idFrom(req);
  // Scoped explicitly — a notice id from another warehouse is not deletable.
  const existing = await prisma.announcement.findFirst({
    where: { id, locationId: ctx.locationId },
  });
  if (!existing) return apiError("not_found", "No notice with that id.", 404);
  await prisma.announcement.delete({ where: { id } });
  await logApi(ctx, "Notice", `Removed a notice via API`, id);
  return apiOk({ deleted: id });
});
