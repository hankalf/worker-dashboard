"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Location = { id: string; name: string };

// Super-admin control in the admin header: pick which warehouse everything you
// manage applies to. Posts the choice (server sets an httpOnly cookie) then
// hard-reloads so every server component re-queries under the new location.
export function LocationSwitcher({
  locations,
  activeId,
}: {
  locations: Location[];
  activeId: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const switchTo = async (locationId: string) => {
    if (!locationId || locationId === activeId) return;
    setBusy(true);
    const res = await fetch("/api/locations/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locationId }),
    });
    if (res.ok) {
      // Full reload — clears any client-cached data from the old location.
      window.location.reload();
    } else {
      setBusy(false);
    }
    router.refresh();
  };

  return (
    <label className="flex items-center gap-2 text-xs text-zinc-400">
      <span className="hidden sm:inline">Location</span>
      <select
        value={activeId ?? ""}
        disabled={busy}
        onChange={(e) => switchTo(e.target.value)}
        className="max-w-[10rem] rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-100 disabled:opacity-50"
      >
        {locations.map((loc) => (
          <option key={loc.id} value={loc.id}>
            {loc.name}
          </option>
        ))}
      </select>
    </label>
  );
}
