import { prisma } from "@/lib/prisma";
import type { ShiftKey } from "@/lib/shift";
import { APP_TZ, easternDateKey, easternInputToUtcISO } from "@/lib/time";

// Labor-share are temporary borrowed workers (not Employees). Server-only
// helpers: compute when a shift next ends, purge finished labor-share, and
// fetch the ones still active for the board.

const SHIFT_END_MIN: Record<ShiftKey, number> = {
  FIRST: 14 * 60, // 2pm
  SECOND: 22 * 60, // 10pm
  THIRD: 6 * 60, // 6am
};

// The next moment (>= now) at which `shift` ends, in Eastern.
export function nextShiftEnd(shift: ShiftKey, now: Date): Date {
  const endMin = SHIFT_END_MIN[shift];
  const hh = String(Math.floor(endMin / 60)).padStart(2, "0");
  const mm = String(endMin % 60).padStart(2, "0");
  const at = (dateKey: string) =>
    new Date(easternInputToUtcISO(`${dateKey}T${hh}:${mm}`));
  let candidate = at(easternDateKey(now));
  if (candidate.getTime() <= now.getTime()) {
    candidate = at(easternDateKey(new Date(now.getTime() + 24 * 3600 * 1000)));
  }
  return candidate;
}

// Interpret an "HH:MM" wall time (Eastern) for today; roll to tomorrow if it's
// not strictly after `after` (used so a leaving time before the coming-in time
// lands on the next day, e.g. 3rd shift 11pm–3am).
export function laborTimeToInstant(
  hhmm: string,
  now: Date,
  after?: Date
): Date {
  const today = easternDateKey(now);
  let d = new Date(easternInputToUtcISO(`${today}T${hhmm}`));
  if (after && d.getTime() <= after.getTime()) {
    const tomorrow = easternDateKey(new Date(now.getTime() + 24 * 3600 * 1000));
    d = new Date(easternInputToUtcISO(`${tomorrow}T${hhmm}`));
  }
  return d;
}

export async function purgeEndedLaborShare(now = new Date()): Promise<void> {
  try {
    await prisma.laborShare.deleteMany({ where: { endsAt: { lt: now } } });
  } catch {
    // table not present yet (pre-migration) — no-op
  }
}

export type LaborShareDto = {
  id: string;
  name: string;
  shift: ShiftKey;
  positionId: string | null;
  positionTitle: string | null;
  comingInAt: string | null;
  leavingAt: string | null;
};

const fmtTime = (d: Date | null) =>
  d
    ? d.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: APP_TZ,
      })
    : null;

// Active (not-yet-ended) labor-share, oldest first. Purges finished ones first.
export async function getActiveLaborShare(
  now = new Date()
): Promise<LaborShareDto[]> {
  try {
    await purgeEndedLaborShare(now);
    const rows = await prisma.laborShare.findMany({
      where: { endsAt: { gt: now } },
      include: { position: true },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      shift: r.shift as ShiftKey,
      positionId: r.positionId,
      positionTitle: r.position?.title ?? null,
      comingInAt: fmtTime(r.comingInAt),
      leavingAt: fmtTime(r.leavingAt),
    }));
  } catch {
    return [];
  }
}
