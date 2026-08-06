"use client";

import { useEffect, useState } from "react";
import { useSuperAdminGuard } from "@/lib/useAdminGuard";

type Location = { id: string; name: string; slug: string };
type Screen = {
  id: string;
  name: string;
  token: string;
  locationId: string;
  lastSeenAt: string | null;
  location: { name: string; slug: string };
};

// A screen counts as "online" if it's loaded the board in the last 2 minutes
// (the board auto-refreshes well within that window).
const ONLINE_MS = 2 * 60 * 1000;

function lastSeenLabel(iso: string | null): { online: boolean; text: string } {
  if (!iso) return { online: false, text: "never opened" };
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < ONLINE_MS) return { online: true, text: "online now" };
  const mins = Math.round(ms / 60000);
  if (mins < 60) return { online: false, text: `last seen ${mins}m ago` };
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return { online: false, text: `last seen ${hrs}h ago` };
  return { online: false, text: `last seen ${Math.round(hrs / 24)}d ago` };
}

export default function FleetPage() {
  const guarded = useSuperAdminGuard();
  const [screens, setScreens] = useState<Screen[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [name, setName] = useState("");
  const [locationId, setLocationId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  const load = async () => {
    const [scr, locs] = await Promise.all([
      fetch("/api/screens").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/locations").then((r) => (r.ok ? r.json() : [])),
    ]);
    setScreens(scr);
    setLocations(locs);
    if (locs[0] && !locationId) setLocationId(locs[0].id);
  };

  useEffect(() => {
    setOrigin(window.location.origin);
    load();
    // Refresh status periodically so online/offline stays current.
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const urlFor = (token: string) => `${origin}/screen/${token}`;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/screens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, locationId }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not register the screen");
      return;
    }
    setName("");
    load();
  };

  const handleDelete = async (screen: Screen) => {
    if (!confirm(`Remove "${screen.name}"? Its display URL will stop working.`))
      return;
    await fetch(`/api/screens/${screen.id}`, { method: "DELETE" });
    load();
  };

  const sendCommand = async (screen: Screen, command: string) => {
    let arg: string | undefined;
    if (command === "message") {
      const text = prompt(`Message to show on "${screen.name}":`);
      if (!text || !text.trim()) return;
      arg = text.trim();
    }
    const res = await fetch(`/api/screens/${screen.id}/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command, arg }),
    });
    setSent(res.ok ? `${screen.id}:${command}` : null);
    setTimeout(() => setSent((s) => (s === `${screen.id}:${command}` ? null : s)), 1500);
  };

  const copyUrl = async (token: string) => {
    await navigator.clipboard.writeText(urlFor(token));
    setCopied(token);
    setTimeout(() => setCopied((c) => (c === token ? null : c)), 1500);
  };

  if (!guarded) {
    return <p className="text-sm text-zinc-500">Checking access…</p>;
  }

  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold text-white">Screen Fleet</h2>
      <p className="mb-4 max-w-2xl text-sm text-zinc-400">
        Register each wall display and assign it a location. Point that screen&apos;s
        browser at its display URL and it shows that location&apos;s board,
        read-only — one deployment can drive many screens across your warehouses.
      </p>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <form
          onSubmit={handleCreate}
          className="flex flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-4 lg:w-[26rem] lg:shrink-0"
        >
          <input
            placeholder="Screen name (e.g. Receiving TV)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500"
          />
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            required
            className="rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100"
          >
            {locations.length === 0 && <option value="">No locations yet</option>}
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
              </option>
            ))}
          </select>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={locations.length === 0}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            Register screen
          </button>
        </form>

        <div className="min-w-0 flex-1">
          {screens.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No screens yet — register one to get its display URL.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {screens.map((screen) => {
                const status = lastSeenLabel(screen.lastSeenAt);
                return (
                  <li
                    key={screen.id}
                    className="flex flex-col gap-2 rounded-lg border border-zinc-800 bg-zinc-900 p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          title={status.text}
                          className={`h-2 w-2 shrink-0 rounded-full ${
                            status.online ? "bg-green-500" : "bg-zinc-600"
                          }`}
                        />
                        <div className="min-w-0">
                          <div className="truncate font-medium text-white">
                            {screen.name}
                          </div>
                          <div className="text-xs text-zinc-400">
                            {screen.location.name} · {status.text}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDelete(screen)}
                        className="shrink-0 text-sm text-red-400 hover:text-red-300"
                      >
                        Remove
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="min-w-0 flex-1 truncate rounded bg-zinc-950 px-2 py-1 font-mono text-xs text-zinc-400">
                        {urlFor(screen.token)}
                      </code>
                      <button
                        onClick={() => copyUrl(screen.token)}
                        className="shrink-0 rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                      >
                        {copied === screen.token ? "Copied!" : "Copy URL"}
                      </button>
                      <a
                        href={urlFor(screen.token)}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                      >
                        Open
                      </a>
                    </div>
                    <div className="flex items-center gap-2 border-t border-zinc-800 pt-2">
                      <span className="text-xs text-zinc-500">Send:</span>
                      {(["refresh", "identify", "message"] as const).map((cmd) => (
                        <button
                          key={cmd}
                          onClick={() => sendCommand(screen, cmd)}
                          className="rounded-md border border-zinc-700 px-2 py-1 text-xs capitalize text-zinc-300 hover:bg-zinc-800"
                        >
                          {sent === `${screen.id}:${cmd}` ? "Sent ✓" : cmd}
                        </button>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
