import { NextResponse } from "next/server";
import { prisma, getActiveLocationId } from "@/lib/prisma";
import { requireAdmin } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import { mintKey, parseScopes, SCOPES } from "@/lib/apiKey";

export const dynamic = "force-dynamic";

// GET — the keys for the active location. Never returns a key; only its
// prefix, which is enough to recognise one and useless on its own.
export async function GET() {
  if (!(await requireAdmin()))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const keys = await prisma.apiKey.findMany({
    orderBy: [{ revokedAt: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      name: true,
      prefix: true,
      scopes: true,
      lastUsedAt: true,
      revokedAt: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ keys, allScopes: SCOPES });
}

// POST — mint a key. The plaintext is in this response and nowhere else, ever;
// losing it means making a new one.
export async function POST(req: Request) {
  if (!(await requireAdmin()))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const locationId = await getActiveLocationId();
  if (!locationId) {
    return NextResponse.json({ error: "No active location" }, { status: 400 });
  }
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "A name is required" }, { status: 400 });
  const scopes = parseScopes(body.scopes);
  if (scopes.length === 0) {
    return NextResponse.json({ error: "Pick at least one scope" }, { status: 400 });
  }

  const { key, prefix, hash } = mintKey();
  const row = await prisma.apiKey.create({
    data: { locationId, name, prefix, hash, scopes: scopes.join(",") },
    select: { id: true, name: true, prefix: true, scopes: true, createdAt: true },
  });
  await logActivity("Integration", `Created API key "${name}" (${scopes.join(", ")})`);
  return NextResponse.json({ ...row, key }, { status: 201 });
}
