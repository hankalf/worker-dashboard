import { withApiKey, apiOk, type ApiContext } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/v1/ping — confirm a key works and show what it can reach. The first
// call anyone integrating should make.
export const GET = withApiKey("read", async (_req: Request, ctx: ApiContext) => {
  const location = await prisma.location.findUnique({
    where: { id: ctx.locationId },
    select: { id: true, name: true, slug: true },
  });
  return apiOk({
    ok: true,
    key: { name: ctx.name, scopes: ctx.scopes },
    location,
  });
});
