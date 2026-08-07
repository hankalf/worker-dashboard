import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import { getShiftBounds } from "@/lib/settings";
import { shiftWindow, type ShiftKey } from "@/lib/shift";

// Auto-stagger lunches. Everyone present is grouped by position, and the Nth
// person in each position takes the Nth slot — so each slot sends at most one
// person per position and every position keeps cover.
//
// Slots are laid out inside the employee's own shift, using the configured
// shift times rather than fixed hours: the block of lunches is centred in the
// shift, spaced 30 minutes apart, and compressed if a large crew wouldn't
// otherwise fit before the shift ends.

const LUNCH_MINUTES = 30; // matches the board's default lunch length
const PREFERRED_GAP = 30;
const MIN_GAP = 5;

// Keep lunches clear of clock-in and clock-out: a sixth of the shift at each
// end, bounded so it stays sensible for very short or very long shifts.
function edgeMargin(shiftLength: number): number {
  return Math.min(90, Math.max(30, Math.round(shiftLength / 6)));
}

// The lunch start times for a shift, given how many slots are needed.
function slotsFor(shift: ShiftKey, count: number, bounds: Parameters<typeof shiftWindow>[1]) {
  const { start, length } = shiftWindow(shift, bounds);
  const margin = edgeMargin(length);

  // The first and last lunch may start no earlier / later than this, so the
  // whole break lands inside the shift.
  const earliest = start + margin;
  const latest = start + length - margin - LUNCH_MINUTES;
  const span = Math.max(0, latest - earliest);

  if (count <= 1) return [Math.round(earliest + span / 2)];

  const gap = Math.max(MIN_GAP, Math.min(PREFERRED_GAP, span / (count - 1)));
  const block = gap * (count - 1);
  // Centre the block of lunches in the usable window, then keep it inside.
  let first = earliest + (span - block) / 2;
  if (first < earliest) first = earliest;
  if (first + block > latest) first = Math.max(earliest, latest - block);

  return Array.from({ length: count }, (_, i) => Math.round(first + i * gap));
}

const hhmm = (min: number) =>
  `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

export async function POST() {
  const staff = await requireStaff();
  if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const bounds = await getShiftBounds();

  const present = await prisma.employee.findMany({
    where: { terminatedAt: null, attendance: "PRESENT", shift: { not: null } },
    select: { id: true, positionId: true, shift: true },
    orderBy: { name: "asc" },
  });

  // shift -> position -> crew. Everyone without a position shares one group, so
  // they're staggered against each other rather than all sent at once.
  const byShift = new Map<ShiftKey, Map<string, string[]>>();
  for (const e of present) {
    const shift = e.shift as ShiftKey;
    const positions = byShift.get(shift) ?? new Map<string, string[]>();
    const key = e.positionId ?? "__none__";
    positions.set(key, [...(positions.get(key) ?? []), e.id]);
    byShift.set(shift, positions);
  }

  const updates: { id: string; lunchStart: string }[] = [];
  for (const [shift, positions] of byShift) {
    // One slot per person in the largest position — smaller crews just use the
    // earlier slots.
    const needed = Math.max(...[...positions.values()].map((c) => c.length));
    const slots = slotsFor(shift, needed, bounds);
    for (const crew of positions.values()) {
      crew.forEach((id, i) => {
        updates.push({ id, lunchStart: hhmm(slots[i]) });
      });
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
