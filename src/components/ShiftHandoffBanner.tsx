"use client";

import { useEffect, useState } from "react";
import { currentShift, SHIFTS } from "@/lib/shift";
import { useNow } from "@/components/DashboardSections";

type ShiftNote = { id: string; message: string };

// The main-dashboard handoff banner. Shows the note for the shift that is (or is
// about to be) active — switching to a shift's note 5 minutes before that shift
// starts so the incoming crew sees it as they arrive. Polls every 60s so an
// edited note appears without a full page reload.
export function ShiftHandoffBanner() {
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
  // Switch to a shift's note 5 minutes before that shift begins.
  const handoffShift = currentShift(new Date(now.getTime() + 5 * 60 * 1000));
  const message = notes[handoffShift];
  if (!message) return null;

  return (
    <div className="mb-6 rounded-lg border border-violet-300 bg-violet-50 px-4 py-3 text-violet-900 dark:border-violet-900 dark:bg-violet-950/50 dark:text-violet-200">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide">
        {SHIFTS[handoffShift].label} Handoff
      </div>
      <div className="whitespace-pre-wrap text-sm">{message}</div>
    </div>
  );
}
