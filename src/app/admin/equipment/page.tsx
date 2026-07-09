"use client";

import { useEffect, useState } from "react";
import { useAdminGuard } from "@/lib/useAdminGuard";
import { CsvImport } from "@/components/CsvImport";

type Equipment = {
  id: string;
  name: string;
  description: string | null;
};

export default function EquipmentPage() {
  const guarded = useAdminGuard();
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const res = await fetch("/api/equipment");
    setEquipment(await res.json());
  };

  useEffect(() => {
    load();
  }, []);

  const resetForm = () => {
    setName("");
    setDescription("");
    setEditingId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const url = editingId ? `/api/equipment/${editingId}` : "/api/equipment";
    const method = editingId ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Something went wrong");
      return;
    }

    resetForm();
    load();
  };

  const handleEdit = (item: Equipment) => {
    setEditingId(item.id);
    setName(item.name);
    setDescription(item.description ?? "");
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this equipment? It will be removed from all employees."))
      return;
    await fetch(`/api/equipment/${id}`, { method: "DELETE" });
    load();
  };

  if (!guarded) {
    return <p className="text-sm text-zinc-500">Checking access…</p>;
  }

  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold text-white">Equipment</h2>
      <p className="mb-4 text-sm text-zinc-400">
        Equipment describes what an employee is able to operate (e.g. Forklift,
        Pallet Jack, Scanner). Assign it to employees on the Employees page.
      </p>

      {/* Two-pane: form stays readable on the left, list fills the window. */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="flex flex-col gap-4 lg:w-[26rem] lg:shrink-0">
      <CsvImport
        endpoint="/api/equipment/import"
        sampleHref="/equipment-import-sample.csv"
        onDone={load}
        instructions={
          <>
            Columns: <code className="text-zinc-300">name</code> and{" "}
            <code className="text-zinc-300">description</code> (optional).
            Existing equipment is updated by name.
          </>
        }
      />

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
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
          >
            {editingId ? "Save changes" : "Add equipment"}
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
        </div>

        <ul className="flex min-w-0 flex-1 flex-col gap-2">
        {equipment.map((item) => (
          <li
            key={item.id}
            className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 p-3"
          >
            <div>
              <div className="font-medium text-white">{item.name}</div>
              {item.description && (
                <div className="text-sm text-zinc-400">{item.description}</div>
              )}
            </div>
            <div className="flex gap-3 text-sm">
              <button
                onClick={() => handleEdit(item)}
                className="text-zinc-400 hover:text-white"
              >
                Edit
              </button>
              <button
                onClick={() => handleDelete(item.id)}
                className="text-red-400 hover:text-red-300"
              >
                Delete
              </button>
            </div>
          </li>
        ))}
        </ul>
      </div>
    </div>
  );
}
