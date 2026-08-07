import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import { getShiftBounds } from "@/lib/settings";
import { currentShift, type ShiftKey } from "@/lib/shift";
import { planAssignments, type SuggestPosition } from "@/lib/assignSuggest";

// Suggest who should fill the shift's understaffed positions. Candidates are
// present, on this shift, and currently unassigned; the matching itself lives in
// lib/assignSuggest. Preview by default — pass { apply: true } to write.

const targetFor = (
  p: { minFirst: number; minSecond: number; minThird: number },
  shift: ShiftKey
) => (shift === "FIRST" ? p.minFirst : shift === "SECOND" ? p.minSecond : p.minThird);

export async function POST(req: Request) {
  const staff = await requireStaff();
  if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const apply = body?.apply === true;

  const bounds = await getShiftBounds();
  const shift = currentShift(new Date(), bounds);

  const [positions, employees] = await Promise.all([
    prisma.position.findMany({ orderBy: [{ sortOrder: "asc" }, { title: "asc" }] }),
    prisma.employee.findMany({
      where: { terminatedAt: null, attendance: "PRESENT", shift },
      include: { roles: { select: { id: true } }, capabilities: { select: { id: true } } },
      orderBy: { name: "asc" },
    }),
  ]);

  const shaped: SuggestPosition[] = positions.map((p) => ({
    id: p.id,
    title: p.title,
    target: targetFor(p, shift),
    assigned: employees.filter((e) => e.positionId === p.id).length,
    requiredRoleId: p.requiredRoleId,
    requiredCapabilityId: p.requiredCapabilityId,
  }));

  const pool = employees
    .filter((e) => !e.positionId)
    .map((e) => ({
      id: e.id,
      name: e.name,
      roleIds: e.roles.map((r) => r.id),
      capabilityIds: e.capabilities.map((c) => c.id),
    }));

  const { suggestions, unfilled } = planAssignments(shaped, pool);

  if (apply && suggestions.length > 0) {
    await prisma.$transaction(
      suggestions.map((s) =>
        prisma.employee.update({
          where: { id: s.employeeId },
          data: { positionId: s.positionId },
        })
      )
    );
    await logActivity("Assign", `Auto-assigned ${suggestions.length} to positions`);
  }

  return NextResponse.json({ shift, applied: apply, suggestions, unfilled });
}
