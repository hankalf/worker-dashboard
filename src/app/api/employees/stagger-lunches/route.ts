import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import { getShiftBounds } from "@/lib/settings";
import { shiftWindow, type ShiftKey } from "@/lib/shift";
import {
  NO_POSITION,
  cleanCapacity,
  slotsNeeded,
  LUNCH_MINUTES,
} from "@/lib/lunchCapacity";

// Auto-stagger lunches. Everyone present is grouped by position and sent out in
// chunks the size of that position's lunch capacity — so a position with the
// default capacity of 1 sends one person per slot and keeps full cover, while a
// position set to 3 sends three at a time and finishes in a third of the slots.
//
// Slots are laid out inside the employee's own shift, using the configured
// shift times rather than fixed hours: the block of lunches is centred in the
// shift, spaced 30 minutes apart, and compressed if a large crew wouldn't
// otherwise fit before the shift ends.

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

  const positions = await prisma.position.findMany({
    select: { id: true, lunchCapacity: true },
  });
  const capacityOf = (key: string) =>
    key === NO_POSITION
      ? 1
      : cleanCapacity(positions.find((p) => p.id === key)?.lunchCapacity);

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
    // Enough slots for whichever position needs the most rounds to get its crew
    // through at its own capacity; positions that need fewer use the earlier
    // slots and finish sooner.
    const needed = Math.max(
      ...[...positions.entries()].map(([key, crew]) =>
        slotsNeeded(crew.length, capacityOf(key))
      )
    );
    const slots = slotsFor(shift, needed, bounds);
    for (const [key, crew] of positions) {
      const capacity = capacityOf(key);
      crew.forEach((id, i) => {
        // Chunk of `capacity` share a slot, so 3 with capacity 2 go out as
        // (slot 0, slot 0, slot 1).
        updates.push({ id, lunchStart: hhmm(slots[Math.floor(i / capacity)]) });
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
