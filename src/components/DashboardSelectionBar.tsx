"use client";

import { useState } from "react";

// Shown at the top of the Admin Dashboard tab once a super-admin has picked a
// dashboard: a compact "Master Dashboard" bar that names the location currently
// being edited and offers a way back to the picker. "Switch dashboard" clears
// the session's selection marker (DELETE /api/locations/switch) and reloads, so
// the tab returns to the Master Dashboard list.
export function DashboardSelectionBar({ name }: { name: string }) {
  const [busy, setBusy] = useState(false);

  const backToMaster = async () => {
    setBusy(true);
    const res = await fetch("/api/locations/switch", { method: "DELETE" });
    if (res.ok) {
      window.location.reload();
    } else {
      setBusy(false);
    }
  };

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3">
      <div className="min-w-0">
        <div className="text-xs uppercase tracking-wide text-zinc-500">
          Master Dashboard
        </div>
        <div className="truncate text-sm text-zinc-200">
          Editing{" "}
          <span className="font-semibold text-white">{name}</span>
        </div>
      </div>
      <button
        type="button"
        onClick={backToMaster}
        disabled={busy}
        className="shrink-0 rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
      >
        {busy ? "Switching…" : "← Switch dashboard"}
      </button>
    </div>
  );
}
