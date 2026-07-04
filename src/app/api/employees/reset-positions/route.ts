import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";

// Clears every employee's position in one shot — the daily "reset the board"
// action used at the start of a shift.
export async function POST() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const result = await prisma.employee.updateMany({
    data: { positionId: null },
  });
  await logActivity(
    "Position",
    `Reset all positions to Unassigned (${result.count} cleared)`
  );
  return NextResponse.json({ ok: true, cleared: result.count });
}
