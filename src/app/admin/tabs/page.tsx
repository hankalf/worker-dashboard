"use client";

import { useEffect, useState } from "react";

type Tab = {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
};

export default function TabsPage() {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sortOrder, setSortOrder] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const res = await fetch("/api/tabs");
    setTabs(await res.json());
  };

  useEffect(() => {
    load();
  }, []);

  const resetForm = () => {
    setName("");
    setDescription("");
    setSortOrder(0);
    setEditingId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const url = editingId ? `/api/tabs/${editingId}` : "/api/tabs";
    const method = editingId ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, sortOrder }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Something went wrong");
      return;
    }

    resetForm();
    load();
  };

  const handleEdit = (tab: Tab) => {
    setEditingId(tab.id);
    setName(tab.name);
    setDescription(tab.description ?? "");
    setSortOrder(tab.sortOrder);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this tab? Jobs assigned to it must be moved first.")) return;
    await fetch(`/api/tabs/${id}`, { method: "DELETE" });
    load();
  };

  return (
    <div className="max-w-2xl">
      <h2 className="mb-4 text-lg font-semibold text-white">Tabs</h2>

      <form
        onSubmit={handleSubmit}
        className="mb-6 flex flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-4"
      >
        <input
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500"
        />
        <input
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500"
        />
        <label className="text-xs text-zinc-400">
          Sort order
          <input
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(Number(e.target.value))}
            className="mt-1 block w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100"
          />
        </label>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
          >
            {editingId ? "Save changes" : "Add tab"}
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

      <ul className="flex flex-col gap-2">
        {tabs.map((tab) => (
          <li
            key={tab.id}
            className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 p-3"
          >
            <div>
              <div className="font-medium text-white">{tab.name}</div>
              {tab.description && (
                <div className="text-sm text-zinc-400">{tab.description}</div>
              )}
            </div>
            <div className="flex gap-3 text-sm">
              <button
                onClick={() => handleEdit(tab)}
                className="text-zinc-400 hover:text-white"
              >
                Edit
              </button>
              <button
                onClick={() => handleDelete(tab.id)}
                className="text-red-400 hover:text-red-300"
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
