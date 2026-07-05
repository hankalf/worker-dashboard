"use client";

import { useEffect, useState } from "react";
import { useAdminGuard } from "@/lib/useAdminGuard";

type Role = {
  id: string;
  name: string;
};

export default function RolesPage() {
  const guarded = useAdminGuard();
  const [roles, setRoles] = useState<Role[]>([]);
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const res = await fetch("/api/roles");
    setRoles(await res.json());
  };

  useEffect(() => {
    load();
  }, []);

  const resetForm = () => {
    setName("");
    setEditingId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const url = editingId ? `/api/roles/${editingId}` : "/api/roles";
    const method = editingId ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Something went wrong");
      return;
    }

    resetForm();
    load();
  };

  const handleEdit = (role: Role) => {
    setEditingId(role.id);
    setName(role.name);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this role? It will be removed from all employees."))
      return;
    await fetch(`/api/roles/${id}`, { method: "DELETE" });
    load();
  };

  if (!guarded) {
    return <p className="text-sm text-zinc-500">Checking access…</p>;
  }

  return (
    <div className="max-w-2xl">
      <h2 className="mb-1 text-lg font-semibold text-white">Roles</h2>
      <p className="mb-4 text-sm text-zinc-400">
        Roles are the job functions an employee can perform (e.g. Receive, Ship,
        Pick, Putaway, DAX). An employee can have several. Assign them on the
        Employees page.
      </p>

      <form
        onSubmit={handleSubmit}
        className="mb-6 flex flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-4"
      >
        <input
          placeholder="Role name (e.g. Receive)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500"
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
          >
            {editingId ? "Save changes" : "Add role"}
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

      {roles.length === 0 ? (
        <p className="text-sm text-zinc-500">No roles yet — add one above.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {roles.map((role) => (
            <li
              key={role.id}
              className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 p-3"
            >
              <div className="font-medium text-white">{role.name}</div>
              <div className="flex gap-3 text-sm">
                <button
                  onClick={() => handleEdit(role)}
                  className="text-zinc-400 hover:text-white"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(role.id)}
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
  );
}
