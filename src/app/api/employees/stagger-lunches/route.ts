import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";

// Shift-appropriate base lunch time (minute of day).
const BASE: Record<string, number> = {
  FIRST: 11 * 60, // 11:00
  SECOND: 18 * 60, // 6:00 PM
  THIRD: 2 * 60, // 2:00 AM
};

// Auto-stagger lunches: within each position + shift, present crew get lunch
// times 30 min apart (from a shift base) so the position stays covered. Done
// server-side in one transaction — avoids firing many concurrent writes at the
// single DB connection.
export async function POST() {
  const staff = await requireStaff();
  if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const present = await prisma.employee.findMany({
    where: { terminatedAt: null, attendance: "PRESENT", NOT: { positionId: null }, shift: { not: null } },
    select: { id: true, name: true, positionId: true, shift: true },
    orderBy: { name: "asc" },
  });

  const groups = new Map<string, typeof present>();
  for (const e of present) {
    const key = `${e.positionId}|${e.shift}`;
    const list = groups.get(key);
    if (list) list.push(e);
    else groups.set(key, [e]);
  }

  const updates: { id: string; lunchStart: string }[] = [];
  for (const [key, list] of groups) {
    const shift = key.split("|")[1];
    let t = BASE[shift] ?? 12 * 60;
    for (const e of list) {
      const hh = String(Math.floor(t / 60) % 24).padStart(2, "0");
      const mm = String(t % 60).padStart(2, "0");
      updates.push({ id: e.id, lunchStart: `${hh}:${mm}` });
      t += 30;
    }
  }

  await prisma.$transaction(
    updates.map((u) =>
      prisma.employee.update({
        where: { id: u.id },
        data: { lunchStart: u.lunchStart, lunchEnd: null },
      })
    )
  );
  await logActivity("Assign", `Staggered lunches (${updates.length})`);
  return NextResponse.json({ ok: true, count: updates.length });
}
