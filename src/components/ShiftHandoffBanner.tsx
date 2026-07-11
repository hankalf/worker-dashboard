"use client";

import { useEffect, useState } from "react";
import {
  currentShift,
  SHIFTS,
  DEFAULT_SHIFT_BOUNDS,
  type ShiftKey,
  type ShiftBounds,
} from "@/lib/shift";
import { useNow } from "@/components/DashboardSections";

type ShiftNote = { id: string; message: string };

// The shift a crew hands off FROM: the previous one on the clock.
const PREV_SHIFT: Record<ShiftKey, ShiftKey> = {
  FIRST: "THIRD",
  SECOND: "FIRST",
  THIRD: "SECOND",
};

// The main-dashboard handoff banner. Shows the OUTGOING crew's note to the
// working shift (1st sees 3rd's note, 2nd sees 1st's, 3rd sees 2nd's) —
// switching 5 minutes before the next shift starts so the incoming crew sees
// their handoff as they arrive. Polls every 60s so an edited note appears
// without a full page reload.
export function ShiftHandoffBanner({
  handoffColor,
  shiftBounds = DEFAULT_SHIFT_BOUNDS,
}: {
  handoffColor?: string;
  shiftBounds?: ShiftBounds;
}) {
  const now = useNow();
  const [notes, setNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    const load = async () => {
      try {
        const data: ShiftNote[] = await (
          await fetch("/api/shift-notes")
        ).json();
        setNotes(Object.fromEntries(data.map((n) => [n.id, n.message])));
      } catch {
        // ignore — keep the last good copy
      }
    };
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  if (!now) return null;
  // Which shift is (about to be) working — flips 5 minutes before it begins.
  const workingShift = currentShift(
    new Date(now.getTime() + 5 * 60 * 1000),
    shiftBounds
  );
  // Show the note the OUTGOING crew left for them.
  const fromShift = PREV_SHIFT[workingShift];
  const message = notes[fromShift];
  if (!message) return null;

  return (
    <div
      // Brand color (when set) tints the border + background; otherwise the
      // default violet classes apply.
      style={
        handoffColor
          ? {
              borderColor: handoffColor,
              backgroundColor: `color-mix(in srgb, ${handoffColor} 18%, transparent)`,
            }
          : undefined
      }
      className="mb-6 rounded-lg border border-violet-300 bg-violet-50 px-4 py-3 text-center text-violet-900 dark:border-violet-900 dark:bg-violet-950/50 dark:text-violet-200"
    >
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide">
        Handoff from {SHIFTS[fromShift].label}
      </div>
      <div className="whitespace-pre-wrap text-sm">{message}</div>
    </div>
  );
}
