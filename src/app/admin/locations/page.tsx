"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSuperAdminGuard } from "@/lib/useAdminGuard";

type Location = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
};

export default function LocationsPage() {
  const guarded = useSuperAdminGuard();
  const router = useRouter();
  const [locations, setLocations] = useState<Location[]>([]);
  const [me, setMe] = useState<{ locationId: string | null }>({ locationId: null });
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [locs, meRes] = await Promise.all([
      fetch("/api/locations").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/me").then((r) => r.json()).catch(() => ({})),
    ]);
    setLocations(locs);
    setMe({ locationId: meRes.locationId ?? null });
  };

  useEffect(() => {
    load();
  }, []);

  const resetForm = () => {
    setName("");
    setEditingId(null);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const url = editingId ? `/api/locations/${editingId}` : "/api/locations";
    const method = editingId ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Something went wrong");
      return;
    }
    resetForm();
    load();
  };

  const handleEdit = (loc: Location) => {
    setEditingId(loc.id);
    setName(loc.name);
    setError(null);
  };

  const handleDelete = async (loc: Location) => {
    if (
      !confirm(
        `Delete "${loc.name}"?\n\nThis permanently removes EVERYTHING in this ` +
          `location — its employees, positions, notices, attendance and history. ` +
          `This cannot be undone.`
      )
    )
      return;
    const res = await fetch(`/api/locations/${loc.id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error ?? "Could not delete the location");
      return;
    }
    load();
    router.refresh();
  };

  if (!guarded) {
    return <p className="text-sm text-zinc-500">Checking access…</p>;
  }

  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold text-white">Locations</h2>
      <p className="mb-4 max-w-2xl text-sm text-zinc-400">
        Each location is an independent warehouse with its own employees,
        positions, notices, attendance and history. Switch the active location
        from the selector in the header; everything you manage applies to the
        location you have selected.
      </p>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-4 lg:w-[26rem] lg:shrink-0"
        >
          <input
            placeholder="Location name (e.g. Shipping Dock)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500"
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {editingId ? "Save changes" : "Add location"}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
              >
                Cancel
              </button>
            )}
          </div>
        </form>

        <div className="min-w-0 flex-1">
          {locations.length === 0 ? (
            <p className="text-sm text-zinc-500">Loading…</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {locations.map((loc) => (
                <li
                  key={loc.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 truncate font-medium text-white">
                      {loc.name}
                      {me.locationId === loc.id && (
                        <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs font-normal text-zinc-400">
                          your account
                        </span>
                      )}
                    </div>
                    <div className="font-mono text-xs text-zinc-500">/{loc.slug}</div>
                  </div>
                  <div className="flex shrink-0 gap-3 text-sm">
                    <button
                      onClick={() => handleEdit(loc)}
                      className="text-zinc-400 hover:text-white"
                    >
                      Rename
                    </button>
                    <button
                      onClick={() => handleDelete(loc)}
                      className="text-red-400 hover:text-red-300"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
