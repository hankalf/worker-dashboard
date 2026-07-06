"use client";

import { useEffect, useState } from "react";
import { useAdminGuard } from "@/lib/useAdminGuard";

type DescItem = {
  id: string;
  name?: string;
  title?: string;
  description: string | null;
};

// Inline editor for the descriptions of a set of items (positions, roles, or
// equipment). Saves each description on its own via the item's PATCH endpoint.
function DescriptionList({
  heading,
  listUrl,
  itemUrl,
}: {
  heading: string;
  listUrl: string;
  itemUrl: (id: string) => string;
}) {
  const [items, setItems] = useState<DescItem[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savedId, setSavedId] = useState<string | null>(null);

  useEffect(() => {
    fetch(listUrl)
      .then((r) => r.json())
      .then((data: DescItem[]) => {
        setItems(data);
        setDrafts(
          Object.fromEntries(data.map((i) => [i.id, i.description ?? ""]))
        );
      })
      .catch(() => {});
  }, [listUrl]);

  const save = async (id: string) => {
    const res = await fetch(itemUrl(id), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: drafts[id] }),
    });
    if (res.ok) {
      setSavedId(id);
      setTimeout(() => setSavedId((s) => (s === id ? null : s)), 1500);
    }
  };

  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
        {heading}
      </h4>
      {items.length === 0 ? (
        <p className="text-sm text-zinc-500">Nothing here yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-2">
              <span className="w-40 shrink-0 truncate text-sm text-zinc-300">
                {item.title ?? item.name}
              </span>
              <input
                value={drafts[item.id] ?? ""}
                onChange={(e) =>
                  setDrafts((d) => ({ ...d, [item.id]: e.target.value }))
                }
                placeholder="Description"
                className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-500"
              />
              <button
                onClick={() => save(item.id)}
                className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
              >
                Save
              </button>
              {savedId === item.id && (
                <span className="text-xs text-green-400">Saved</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const guarded = useAdminGuard();
  const [dashboardName, setDashboardName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => setDashboardName(data.dashboardName ?? ""))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setSaving(true);
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dashboardName }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Something went wrong");
      return;
    }
    const data = await res.json();
    setDashboardName(data.dashboardName);
    setSaved(true);
    // Reflect the new name in this browser's tab title immediately.
    document.title = data.dashboardName;
  };

  if (!guarded) {
    return <p className="text-sm text-zinc-500">Checking access…</p>;
  }

  return (
    <div className="max-w-2xl">
      <h2 className="mb-4 text-lg font-semibold text-white">General</h2>

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-4"
      >
        <label className="text-sm font-medium text-zinc-300">
          Dashboard name
          <input
            value={dashboardName}
            onChange={(e) => {
              setDashboardName(e.target.value);
              setSaved(false);
            }}
            disabled={loading}
            placeholder="Warehouse Dashboard"
            required
            className="mt-1 block w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500"
          />
        </label>
        <p className="text-xs text-zinc-500">
          Shown on the main dashboard header, the browser tab, the login page,
          and the admin panel.
        </p>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving || loading}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          {saved && <span className="text-sm text-green-400">Saved</span>}
        </div>
      </form>

      <div className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
        <h3 className="text-sm font-medium text-white">Backup</h3>
        <p className="mt-1 text-sm text-zinc-400">
          Download a full JSON snapshot of employees, positions, roles,
          equipment, side tasks, notices, and settings. Passwords are not
          included.
        </p>
        <a
          href="/api/backup"
          className="mt-3 inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
        >
          Download full backup
        </a>
      </div>

      <div className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
        <h3 className="text-sm font-medium text-white">Descriptions</h3>
        <p className="mb-4 mt-1 text-sm text-zinc-400">
          Edit the descriptions for positions (shown on the dashboard), roles,
          and equipment.
        </p>
        <div className="flex flex-col gap-6">
          <DescriptionList
            heading="Positions"
            listUrl="/api/positions"
            itemUrl={(id) => `/api/positions/${id}`}
          />
          <DescriptionList
            heading="Roles"
            listUrl="/api/roles"
            itemUrl={(id) => `/api/roles/${id}`}
          />
          <DescriptionList
            heading="Equipment"
            listUrl="/api/equipment"
            itemUrl={(id) => `/api/equipment/${id}`}
          />
        </div>
      </div>
    </div>
  );
}
