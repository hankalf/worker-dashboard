"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { currentShift, SHIFTS, type ShiftKey } from "@/lib/shift";
import { useNow } from "@/components/DashboardSections";

type ShiftNote = {
  id: string;
  message: string;
  updatedByName: string | null;
  updatedAt: string;
};

const HANDOFF_SHIFTS: ShiftKey[] = ["FIRST", "SECOND", "THIRD"];

// Editable per-shift handoff notes, shown on both the Admin Dashboard and the
// Assign tab. Self-contained: fetches the current notes and saves on its own.
export function ShiftHandoffEditor() {
  const now = useNow();
  const router = useRouter();

  const [notesById, setNotesById] = useState<Record<string, ShiftNote>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({
    FIRST: "",
    SECOND: "",
    THIRD: "",
  });
  const [savingShift, setSavingShift] = useState<string | null>(null);
  const [savedShift, setSavedShift] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const notes: ShiftNote[] = await (
        await fetch("/api/shift-notes")
      ).json();
      const map = Object.fromEntries(notes.map((n) => [n.id, n]));
      setNotesById(map);
      setDrafts({
        FIRST: map.FIRST?.message ?? "",
        SECOND: map.SECOND?.message ?? "",
        THIRD: map.THIRD?.message ?? "",
      });
    })();
  }, []);

  const nowShift = now ? currentShift(now) : null;

  const save = async (shift: ShiftKey) => {
    setSavingShift(shift);
    await fetch("/api/shift-notes", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shift, message: drafts[shift] }),
    });
    setSavingShift(null);
    setSavedShift(shift);
    setTimeout(() => setSavedShift(null), 2000);
    router.refresh();
  };

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400">
        Shift handoff notes
      </label>
      <p className="text-xs text-zinc-500">
        Shown above the notices for whichever shift is active. Leave blank to
        clear.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {HANDOFF_SHIFTS.map((shift) => (
          <div
            key={shift}
            className={`rounded-md border p-3 ${
              nowShift === shift
                ? "border-violet-700 bg-violet-950/30"
                : "border-zinc-700 bg-zinc-800/40"
            }`}
          >
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-200">
                {SHIFTS[shift].label}
              </span>
              {nowShift === shift && (
                <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] font-semibold text-violet-300">
                  ACTIVE
                </span>
              )}
            </div>
            <textarea
              value={drafts[shift]}
              onChange={(e) =>
                setDrafts((d) => ({ ...d, [shift]: e.target.value }))
              }
              rows={3}
              placeholder="Notes for the incoming crew…"
              className="w-full resize-y rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-100 placeholder-zinc-500"
            />
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="truncate text-[10px] text-zinc-500">
                {notesById[shift]?.updatedByName
                  ? `by ${notesById[shift].updatedByName}`
                  : ""}
              </span>
              <button
                onClick={() => save(shift)}
                disabled={savingShift === shift}
                className="shrink-0 rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
              >
                {savingShift === shift
                  ? "Saving…"
                  : savedShift === shift
                    ? "Saved ✓"
                    : "Save"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
