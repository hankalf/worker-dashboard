"use client";

import { useEffect, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useAdminGuard } from "@/lib/useAdminGuard";
import { CsvImport } from "@/components/CsvImport";

type Role = {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
};

function SortableRole({
  role,
  onEdit,
  onDelete,
}: {
  role: Role;
  onEdit: (r: Role) => void;
  onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: role.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-3 ${
        isDragging ? "relative z-10 opacity-70 shadow-lg shadow-black/40" : ""
      }`}
    >
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
          className="shrink-0 cursor-grab touch-none text-zinc-500 hover:text-zinc-300 active:cursor-grabbing"
        >
          <svg width="12" height="18" viewBox="0 0 12 18" fill="currentColor">
            <circle cx="3" cy="3" r="1.4" />
            <circle cx="9" cy="3" r="1.4" />
            <circle cx="3" cy="9" r="1.4" />
            <circle cx="9" cy="9" r="1.4" />
            <circle cx="3" cy="15" r="1.4" />
            <circle cx="9" cy="15" r="1.4" />
          </svg>
        </button>
        <div className="min-w-0">
          <div className="truncate font-medium text-white">{role.name}</div>
          {role.description && (
            <div className="text-sm text-zinc-400">{role.description}</div>
          )}
        </div>
      </div>
      <div className="flex shrink-0 gap-3 text-sm">
        <button
          onClick={() => onEdit(role)}
          className="text-zinc-400 hover:text-white"
        >
          Edit
        </button>
        <button
          onClick={() => onDelete(role.id)}
          className="text-red-400 hover:text-red-300"
        >
          Delete
        </button>
      </div>
    </li>
  );
}

export default function RolesPage() {
  const guarded = useAdminGuard();
  const [roles, setRoles] = useState<Role[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const load = async () => {
    const res = await fetch("/api/roles");
    setRoles(await res.json());
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

    const url = editingId ? `/api/roles/${editingId}` : "/api/roles";
    const method = editingId ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description,
        // New roles go to the end; editing leaves the order untouched.
        ...(editingId ? {} : { sortOrder: roles.length }),
      }),
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
    setDescription(role.description ?? "");
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this role? It will be removed from all employees."))
      return;
    await fetch(`/api/roles/${id}`, { method: "DELETE" });
    load();
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = roles.findIndex((r) => r.id === active.id);
    const newIndex = roles.findIndex((r) => r.id === over.id);
    const reordered = arrayMove(roles, oldIndex, newIndex);
    setRoles(reordered); // optimistic
    await fetch("/api/roles/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: reordered.map((r) => r.id) }),
    });
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

      <CsvImport
        endpoint="/api/roles/import"
        sampleHref="/role-import-sample.csv"
        onDone={load}
        instructions={
          <>
            Columns: <code className="text-zinc-300">name</code> and{" "}
            <code className="text-zinc-300">description</code> (optional).
            Existing roles are updated by name.
          </>
        }
      />

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
        <>
          <p className="mb-2 text-xs text-zinc-500">
            Drag the handle to reorder — this is the order roles appear on
            employee cards.
          </p>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={roles.map((r) => r.id)}
              strategy={verticalListSortingStrategy}
            >
              <ul className="flex flex-col gap-2">
                {roles.map((role) => (
                  <SortableRole
                    key={role.id}
                    role={role}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        </>
      )}
    </div>
  );
}
