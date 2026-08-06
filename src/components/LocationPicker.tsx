"use client";

import { useState } from "react";

export type LocationCard = {
  id: string;
  name: string;
  slug: string;
  employees: number;
  present: number;
};

// The super-admin's dashboard landing: every location as a clickable card.
// Clicking a card makes it the active location (server sets the httpOnly
// cookie) and hard-reloads, so the whole admin panel — every tab — now edits
// that dashboard. The currently-active card is highlighted and can't be
// re-clicked.
export function LocationPicker({
  locations,
  activeId,
  title = "Master Dashboard",
  subtitle = "Select a dashboard to manage — every tab applies to it.",
}: {
  locations: LocationCard[];
  activeId: string | null;
  title?: string;
  subtitle?: string;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);

  const switchTo = async (locationId: string) => {
    if (!locationId || locationId === activeId || busyId) return;
    setBusyId(locationId);
    const res = await fetch("/api/locations/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locationId }),
    });
    if (res.ok) {
      // Full reload so every server component re-queries the new location.
      window.location.reload();
    } else {
      setBusyId(null);
    }
  };

  if (locations.length === 0) return null;

  return (
    <section className="mb-6">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        <p className="hidden text-xs text-zinc-500 sm:block">{subtitle}</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {locations.map((loc) => {
          const active = loc.id === activeId;
          const busy = busyId === loc.id;
          return (
            <button
              key={loc.id}
              type="button"
              onClick={() => switchTo(loc.id)}
              disabled={active || busy}
              aria-current={active ? "true" : undefined}
              className={`group flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition ${
                active
                  ? "border-blue-500 bg-blue-500/10 cursor-default"
                  : "border-zinc-800 bg-zinc-900 hover:border-zinc-600 hover:bg-zinc-800"
              } ${busy ? "opacity-60" : ""}`}
            >
              <div className="flex w-full items-center justify-between gap-2">
                <span className="min-w-0 truncate font-medium text-white">
                  {loc.name}
                </span>
                {active ? (
                  <span className="shrink-0 rounded-full bg-blue-600/20 px-2 py-0.5 text-xs font-semibold text-blue-300">
                    Editing
                  </span>
                ) : (
                  <span className="shrink-0 text-xs text-zinc-500 group-hover:text-zinc-300">
                    {busy ? "Switching…" : "Manage →"}
                  </span>
                )}
              </div>
              <span className="font-mono text-xs text-zinc-500">/{loc.slug}</span>
              <span className="text-xs text-zinc-400">
                {loc.present}/{loc.employees} present · {loc.employees} employee
                {loc.employees === 1 ? "" : "s"}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
