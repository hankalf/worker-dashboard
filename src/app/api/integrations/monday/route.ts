import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import { getMondayConfig, setMondayConfig, getLastSyncAt } from "@/lib/monday";

export const dynamic = "force-dynamic";

// GET — current Monday config for the active location. Never returns the API
// token; only whether one is stored.
export async function GET() {
  if (!(await requireAdmin()))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({
    ...(await getMondayConfig()),
    lastSyncAt: await getLastSyncAt(),
  });
}

// PUT — save config. A blank apiToken is ignored, so editing the board ID or a
// column mapping doesn't wipe the stored secret.
export async function PUT(req: Request) {
  if (!(await requireAdmin()))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  const bool = (v: unknown) => (v === undefined ? undefined : !!v);
  await setMondayConfig({
    enabled: bool(body.enabled),
    apiToken: str(body.apiToken),
    boardId: str(body.boardId),
    apiVersion: str(body.apiVersion),
    nameColumn: str(body.nameColumn),
    positionColumn: str(body.positionColumn),
    shiftColumn: str(body.shiftColumn),
    employeeNumberColumn: str(body.employeeNumberColumn),
    misc1Column: str(body.misc1Column),
    misc2Column: str(body.misc2Column),
    terminateMissing: bool(body.terminateMissing),
    syncMinutes:
      body.syncMinutes === undefined || body.syncMinutes === ""
        ? undefined
        : Number(body.syncMinutes),
  });
  await logActivity("Integration", "Updated Monday board settings");
  return NextResponse.json({
    ...(await getMondayConfig()),
    lastSyncAt: await getLastSyncAt(),
  });
}
