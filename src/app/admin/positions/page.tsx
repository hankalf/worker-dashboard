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

type Role = { id: string; name: string };
type Capability = { id: string; name: string };
type Position = {
  id: string;
  title: string;
  description: string | null;
  sortOrder: number;
  requiredRoleId: string | null;
  requiredRole: Role | null;
  requiredCapabilityId: string | null;
  requiredCapability: Capability | null;
};

function SortablePosition({
  position,
  onEdit,
  onDelete,
}: {
  position: Position;
  onEdit: (p: Position) => void;
  onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: position.id });
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
          <div className="truncate font-medium text-white">{position.title}</div>
          {position.description && (
            <div className="text-sm text-zinc-400">{position.description}</div>
          )}
          {position.requiredRole && (
            <div className="text-xs text-zinc-500">
              Requires equipment: {position.requiredRole.name}
            </div>
          )}
          {position.requiredCapability && (
            <div className="text-xs text-zinc-500">
              Requires role: {position.requiredCapability.name}
            </div>
          )}
        </div>
      </div>
      <div className="flex shrink-0 gap-3 text-sm">
        <button
          onClick={() => onEdit(position)}
          className="text-zinc-400 hover:text-white"
        >
          Edit
        </button>
        <button
          onClick={() => onDelete(position.id)}
          className="text-red-400 hover:text-red-300"
        >
          Delete
        </button>
      </div>
    </li>
  );
}

export default function PositionsPage() {
  const guarded = useAdminGuard();
  const [positions, setPositions] = useState<Position[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [requiredRoleId, setRequiredRoleId] = useState("");
  const [requiredCapabilityId, setRequiredCapabilityId] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const load = async () => {
    const [positionsRes, rolesRes, capabilitiesRes] = await Promise.all([
      fetch("/api/positions"),
      fetch("/api/equipment"),
      fetch("/api/roles"),
    ]);
    setPositions(await positionsRes.json());
    setRoles(await rolesRes.json());
    setCapabilities(await capabilitiesRes.json());
  };

  useEffect(() => {
    load();
  }, []);

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setRequiredRoleId("");
    setRequiredCapabilityId("");
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
      body: JSON.stringify({
        title,
        description,
        requiredRoleId,
        requiredCapabilityId,
        // New positions go to the end; editing leaves the order untouched.
        ...(editingId ? {} : { sortOrder: positions.length }),
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

  const handleEdit = (position: Position) => {
    setEditingId(position.id);
    setTitle(position.title);
    setDescription(position.description ?? "");
    setRequiredRoleId(position.requiredRoleId ?? "");
    setRequiredCapabilityId(position.requiredCapabilityId ?? "");
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this position?")) return;
    await fetch(`/api/positions/${id}`, { method: "DELETE" });
    load();
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = positions.findIndex((p) => p.id === active.id);
    const newIndex = positions.findIndex((p) => p.id === over.id);
    const reordered = arrayMove(positions, oldIndex, newIndex);
    setPositions(reordered); // optimistic
    await fetch("/api/positions/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: reordered.map((p) => p.id) }),
    });
  };

  if (!guarded) {
    return <p className="text-sm text-zinc-500">Checking access…</p>;
  }

  return (
    <div className="max-w-2xl">
      <h2 className="mb-4 text-lg font-semibold text-white">Positions</h2>

      <CsvImport
        endpoint="/api/positions/import"
        sampleHref="/position-import-sample.csv"
        onDone={load}
        instructions={
          <>
            Columns: <code className="text-zinc-300">title</code>,{" "}
            <code className="text-zinc-300">description</code>,{" "}
            <code className="text-zinc-300">equipment</code> (required
            equipment), and <code className="text-zinc-300">role</code>{" "}
            (required role). Missing equipment/roles are created automatically;
            existing positions are updated by title.
          </>
        }
      />

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
          Required equipment (optional — warns when assigning someone without it)
          <select
            value={requiredRoleId}
            onChange={(e) => setRequiredRoleId(e.target.value)}
            className="mt-1 block w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100"
          >
            <option value="">No required equipment</option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-zinc-400">
          Required role (optional — warns when assigning someone who can&apos;t
          perform it)
          <select
            value={requiredCapabilityId}
            onChange={(e) => setRequiredCapabilityId(e.target.value)}
            className="mt-1 block w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100"
          >
            <option value="">No required role</option>
            {capabilities.map((cap) => (
              <option key={cap.id} value={cap.id}>
                {cap.name}
              </option>
            ))}
          </select>
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

      <p className="mb-2 text-xs text-zinc-500">
        Drag the handle to reorder — this is the order positions appear on the
        dashboard and assign board.
      </p>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={positions.map((p) => p.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="flex flex-col gap-2">
            {positions.map((position) => (
              <SortablePosition
                key={position.id}
                position={position}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  );
}
