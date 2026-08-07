import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import {
  getOpendockConfig,
  setOpendockConfig,
  clearOpendockCache,
} from "@/lib/opendock";

export const dynamic = "force-dynamic";

// GET — current Opendock config for the active location (never returns the
// stored password; just whether one is set).
export async function GET() {
  if (!(await requireAdmin()))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await getOpendockConfig());
}

// PUT — save config for the active location. A blank password is ignored so
// editing other fields doesn't clear the stored secret.
export async function PUT(req: Request) {
  if (!(await requireAdmin()))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  await setOpendockConfig({
    enabled: body.enabled === undefined ? undefined : !!body.enabled,
    baseUrl: typeof body.baseUrl === "string" ? body.baseUrl : undefined,
    email: typeof body.email === "string" ? body.email : undefined,
    warehouseId:
      typeof body.warehouseId === "string" ? body.warehouseId : undefined,
    password: typeof body.password === "string" ? body.password : undefined,
    windowHours:
      Number.isFinite(Number(body.windowHours)) && body.windowHours !== ""
        ? Number(body.windowHours)
        : undefined,
    personRoles:
      typeof body.personRoles === "string" ? body.personRoles : undefined,
    aliases: typeof body.aliases === "string" ? body.aliases : undefined,
  });
  clearOpendockCache();
  await logActivity("Integration", "Updated Opendock settings");
  return NextResponse.json(await getOpendockConfig());
}
