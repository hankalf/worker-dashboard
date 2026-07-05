import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";

// Marks everyone Present — the start-of-shift "everyone's here" reset.
export async function POST() {
  const staff = await requireStaff();
  if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const result = await prisma.employee.updateMany({
    where: { terminatedAt: null, attendance: { not: "PRESENT" } },
    data: { attendance: "PRESENT" },
  });
  await logActivity(
    "Attendance",
    `Marked all present (${result.count} updated)`
  );
  return NextResponse.json({ ok: true, updated: result.count });
}
