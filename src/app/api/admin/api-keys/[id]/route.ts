import { NextResponse } from "next/server";
import { prisma, getActiveLocationId } from "@/lib/prisma";
import { requireAdmin } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";

// DELETE — revoke a key. Revoked, not deleted: the activity log goes on naming
// the key that made each past change. It stops working immediately.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAdmin()))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const locationId = await getActiveLocationId();
  // ApiKey is not one of the models the tenant extension scopes, so pin the
  // location here: an admin must not revoke another location's key.
  const existing = await prisma.apiKey.findFirst({
    where: { id, ...(locationId ? { locationId } : {}) },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
  await logActivity("Integration", `Revoked API key "${existing.name}"`);
  return NextResponse.json({ ok: true });
}
