import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import { easternDateKey } from "@/lib/time";
import {
  getActiveLaborShare,
  nextShiftEnd,
  laborTimeToInstant,
} from "@/lib/laborShareServer";
import type { ShiftKey } from "@/lib/shift";

const SHIFTS = ["FIRST", "SECOND", "THIRD"];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// Turn the shift + optional coming-in / leaving times into the stored instants
// plus the auto-purge time (leaving, or the shift's end if none given).
function computeTimes(
  shift: ShiftKey,
  comingIn: string | null,
  leaving: string | null,
  now = new Date()
) {
  const comingInAt = comingIn ? laborTimeToInstant(comingIn, now) : null;
  const leavingAt = leaving
    ? laborTimeToInstant(leaving, now, comingInAt ?? now)
    : null;
  const endsAt = leavingAt ?? nextShiftEnd(shift, now);
  return { comingInAt, leavingAt, endsAt };
}

// GET — active (not-yet-ended) labor-share; finished ones are purged first.
export async function GET() {
  const staff = await requireStaff();
  if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await getActiveLaborShare());
}

// POST — add a labor-share worker for a shift, with optional dept (position)
// and coming-in / leaving times. { name, shift, positionId?, comingIn?, leaving? }
export async function POST(req: Request) {
  const staff = await requireStaff();
  if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { name, shift, positionId, comingIn, leaving } = await req.json();
  if (!name || !String(name).trim())
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!SHIFTS.includes(shift))
    return NextResponse.json({ error: "Invalid shift" }, { status: 400 });
  if (comingIn && !TIME_RE.test(comingIn))
    return NextResponse.json({ error: "Invalid coming-in time" }, { status: 400 });
  if (leaving && !TIME_RE.test(leaving))
    return NextResponse.json({ error: "Invalid leaving time" }, { status: 400 });

  const now = new Date();
  const { comingInAt, leavingAt, endsAt } = computeTimes(
    shift as ShiftKey,
    comingIn || null,
    leaving || null,
    now
  );

  await prisma.laborShare.create({
    data: {
      name: String(name).trim(),
      shift,
      positionId: positionId || null,
      comingInAt,
      leavingAt,
      endsAt,
      date: easternDateKey(now),
    },
  });
  await logActivity("LaborShare", `Added labor share ${String(name).trim()}`);
  return NextResponse.json(await getActiveLaborShare(now));
}

// PATCH — edit an existing labor-share entry. { id, name, shift, positionId?,
// comingIn?, leaving? } — times/shift are recomputed (incl. the purge time).
export async function PATCH(req: Request) {
  const staff = await requireStaff();
  if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id, name, shift, positionId, comingIn, leaving } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (!name || !String(name).trim())
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!SHIFTS.includes(shift))
    return NextResponse.json({ error: "Invalid shift" }, { status: 400 });
  if (comingIn && !TIME_RE.test(comingIn))
    return NextResponse.json({ error: "Invalid coming-in time" }, { status: 400 });
  if (leaving && !TIME_RE.test(leaving))
    return NextResponse.json({ error: "Invalid leaving time" }, { status: 400 });

  const now = new Date();
  const { comingInAt, leavingAt, endsAt } = computeTimes(
    shift as ShiftKey,
    comingIn || null,
    leaving || null,
    now
  );

  try {
    await prisma.laborShare.update({
      where: { id },
      data: {
        name: String(name).trim(),
        shift,
        positionId: positionId || null,
        comingInAt,
        leavingAt,
        endsAt,
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await logActivity("LaborShare", `Edited labor share ${String(name).trim()}`);
  return NextResponse.json(await getActiveLaborShare(now));
}

// DELETE ?id=… — remove one labor-share entry.
export async function DELETE(req: Request) {
  const staff = await requireStaff();
  if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = new URL(req.url).searchParams.get("id") ?? "";
  const existing = await prisma.laborShare.findUnique({ where: { id } });
  if (existing) {
    await prisma.laborShare.delete({ where: { id } });
    await logActivity("LaborShare", `Removed labor share ${existing.name}`);
  }
  return NextResponse.json(await getActiveLaborShare());
}
