"use client";

import { useEffect, useState } from "react";
import { useAdminGuard } from "@/lib/useAdminGuard";

type Role = { id: string; name: string };
type Position = {
  id: string;
  title: string;
  description: string | null;
  sortOrder: number;
  requiredRoleId: string | null;
  requiredRole: Role | null;
};

export default function PositionsPage() {
  const guarded = useAdminGuard();
  const [positions, setPositions] = useState<Position[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [requiredRoleId, setRequiredRoleId] = useState("");
  const [sortOrder, setSortOrder] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const [positionsRes, rolesRes] = await Promise.all([
      fetch("/api/positions"),
      fetch("/api/roles"),
    ]);
    setPositions(await positionsRes.json());
    setRoles(await rolesRes.json());
  };

  useEffect(() => {
    load();
  }, []);

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setRequiredRoleId("");
    setSortOrder(0);
    setEditingId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const url = editingId ? `/api/positions/${editingId}` : "/api/positions";
    const method = editingId ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description, requiredRoleId, sortOrder }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Something went wrong");
      return;
    }

    resetForm();
    load();
  };

  const handleEdit = (position: Position) => {
    setEditingId(position.id);
    setTitle(position.title);
    setDescription(position.description ?? "");
    setRequiredRoleId(position.requiredRoleId ?? "");
    setSortOrder(position.sortOrder ?? 0);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this position?")) return;
    await fetch(`/api/positions/${id}`, { method: "DELETE" });
    load();
  };

  if (!guarded) {
    return <p className="text-sm text-zinc-500">Checking access…</p>;
  }

  return (
    <div className="max-w-2xl">
      <h2 className="mb-4 text-lg font-semibold text-white">Positions</h2>

      <form
        onSubmit={handleSubmit}
        className="mb-6 flex flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-4"
      >
        <input
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
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
          Required role (optional — warns when assigning someone without it)
          <select
            value={requiredRoleId}
            onChange={(e) => setRequiredRoleId(e.target.value)}
            className="mt-1 block w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100"
          >
            <option value="">No required role</option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-zinc-400">
          Display order on the dashboard (lower shows first)
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
            {editingId ? "Save changes" : "Add position"}
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
        {positions.map((position) => (
          <li
            key={position.id}
            className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 p-3"
          >
            <div>
              <div className="flex items-center gap-2 font-medium text-white">
                <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-400">
                  #{position.sortOrder}
                </span>
                {position.title}
              </div>
              {position.description && (
                <div className="text-sm text-zinc-400">{position.description}</div>
              )}
              {position.requiredRole && (
                <div className="text-xs text-zinc-500">
                  Requires: {position.requiredRole.name}
                </div>
              )}
            </div>
            <div className="flex gap-3 text-sm">
              <button
                onClick={() => handleEdit(position)}
                className="text-zinc-400 hover:text-white"
              >
                Edit
              </button>
              <button
                onClick={() => handleDelete(position.id)}
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
