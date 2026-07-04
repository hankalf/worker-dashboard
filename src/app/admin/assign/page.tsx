"use client";

import { useEffect, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";

type Position = { id: string; title: string };
type Role = { id: string; name: string };
type Employee = {
  id: string;
  name: string;
  positionId: string | null;
  roles: Role[];
  lunchStart: string | null;
  lunchEnd: string | null;
};

type SaveState = "saving" | "saved" | "error";

const UNASSIGNED = "unassigned";

// Lunch start times in 15-minute steps across the day. Lunch is always 30
// minutes, so only the start is chosen; the end is start + 30 everywhere.
const LUNCH_TIMES = Array.from({ length: 96 }, (_, i) => {
  const h = Math.floor(i / 4);
  const m = (i % 4) * 15;
  const value = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  const h12 = ((h + 11) % 12) + 1;
  const label = `${h12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
  return { value, label };
});

// Stop pointer/keyboard events on the lunch controls from starting a drag
const stopDrag = (e: React.PointerEvent | React.KeyboardEvent) =>
  e.stopPropagation();

function EmployeeCard({
  employee,
  saveState,
  onLunchChange,
  overlay = false,
}: {
  employee: Employee;
  saveState?: SaveState;
  onLunchChange?: (id: string, value: string) => void;
  overlay?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: employee.id,
    disabled: overlay,
  });

  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      {...(overlay ? {} : { ...listeners, ...attributes })}
      className={`select-none rounded-md border p-3 ${
        overlay
          ? "border-blue-500 bg-zinc-800 shadow-lg shadow-black/50"
          : isDragging
            ? "border-zinc-700 bg-zinc-800/40 opacity-40"
            : "cursor-grab border-zinc-700 bg-zinc-800 hover:border-zinc-500 active:cursor-grabbing"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-white">{employee.name}</span>
        {saveState === "saving" && (
          <span className="text-xs text-zinc-500">…</span>
        )}
        {saveState === "saved" && (
          <span className="text-xs text-green-400">✓</span>
        )}
        {saveState === "error" && (
          <span className="text-xs text-red-400">failed</span>
        )}
      </div>
      {employee.roles.length > 0 && (
        <div className="mt-1 text-xs text-zinc-500">
          {employee.roles.map((role) => role.name).join(" · ")}
        </div>
      )}
      {!overlay && onLunchChange && (
        <div
          onPointerDown={stopDrag}
          onKeyDown={stopDrag}
          className="mt-2 flex items-center gap-2 text-xs text-zinc-500"
        >
          <span>Lunch</span>
          <select
            value={employee.lunchStart ?? ""}
            onChange={(e) => onLunchChange(employee.id, e.target.value)}
            style={{ colorScheme: "dark" }}
            className="rounded border border-zinc-700 bg-zinc-900 px-1 py-0.5 text-zinc-100"
          >
            <option value="">None</option>
            {LUNCH_TIMES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

function PositionColumn({
  id,
  title,
  employees,
  saveStates,
  onLunchChange,
}: {
  id: string;
  title: string;
  employees: Employee[];
  saveStates: Record<string, SaveState>;
  onLunchChange: (id: string, value: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col rounded-lg border p-3 transition-colors ${
        isOver
          ? "border-blue-500 bg-blue-950/30"
          : "border-zinc-800 bg-zinc-900"
      }`}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
          {employees.length}
        </span>
      </div>
      <div className="flex min-h-16 flex-1 flex-col gap-2">
        {employees.map((employee) => (
          <EmployeeCard
            key={employee.id}
            employee={employee}
            saveState={saveStates[employee.id]}
            onLunchChange={onLunchChange}
          />
        ))}
        {employees.length === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-zinc-800 p-3 text-xs text-zinc-600">
            Drop here
          </div>
        )}
      </div>
    </div>
  );
}

export default function AssignPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const [activeId, setActiveId] = useState<string | null>(null);

  // Small movement threshold so taps/scrolls on touchscreens don't start a
  // drag; keyboard sensor lets cards be moved with Enter + arrow keys too.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  useEffect(() => {
    (async () => {
      const [employeesRes, positionsRes] = await Promise.all([
        fetch("/api/employees"),
        fetch("/api/positions"),
      ]);
      if (employeesRes.status === 403) {
        window.location.href = "/login";
        return;
      }
      setEmployees(await employeesRes.json());
      setPositions(await positionsRes.json());
    })();
  }, []);

  const flashSaved = (employeeId: string, ok: boolean) => {
    setSaveStates((s) => ({ ...s, [employeeId]: ok ? "saved" : "error" }));
    if (ok) {
      setTimeout(
        () =>
          setSaveStates((s) => {
            const next = { ...s };
            if (next[employeeId] === "saved") delete next[employeeId];
            return next;
          }),
        1500
      );
    }
  };

  const assign = async (employeeId: string, positionId: string | null) => {
    setEmployees((current) =>
      current.map((e) => (e.id === employeeId ? { ...e, positionId } : e))
    );
    setSaveStates((s) => ({ ...s, [employeeId]: "saving" }));

    const res = await fetch(`/api/employees/${employeeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ positionId: positionId ?? "" }),
    });
    flashSaved(employeeId, res.ok);
  };

  const setLunch = async (employeeId: string, value: string) => {
    // Lunch is always 30 min; store the start and clear any old explicit end.
    setEmployees((current) =>
      current.map((e) =>
        e.id === employeeId ? { ...e, lunchStart: value || null, lunchEnd: null } : e
      )
    );
    setSaveStates((s) => ({ ...s, [employeeId]: "saving" }));

    const res = await fetch(`/api/employees/${employeeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lunchStart: value, lunchEnd: "" }),
    });
    flashSaved(employeeId, res.ok);
  };

  const resetAll = async () => {
    if (
      !confirm(
        "Clear every employee's position? This moves everyone back to Unassigned."
      )
    )
      return;

    const res = await fetch("/api/employees/reset-positions", {
      method: "POST",
    });
    if (res.ok) {
      setEmployees((current) =>
        current.map((e) => ({ ...e, positionId: null }))
      );
    } else {
      alert("Could not reset positions. Please try again.");
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const employeeId = String(active.id);
    const targetPositionId = over.id === UNASSIGNED ? null : String(over.id);
    const employee = employees.find((e) => e.id === employeeId);
    if (!employee || employee.positionId === targetPositionId) return;

    assign(employeeId, targetPositionId);
  };

  const activeEmployee = activeId
    ? employees.find((e) => e.id === activeId)
    : null;

  const columns = [
    { id: UNASSIGNED, title: "Unassigned" },
    ...positions.map((p) => ({ id: p.id, title: p.title })),
  ];

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-white">Assign Positions</h2>
        <button
          onClick={resetAll}
          className="shrink-0 rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:border-red-500 hover:text-red-400"
        >
          Reset all to Unassigned
        </button>
      </div>
      <p className="mb-4 text-sm text-zinc-400">
        Drag an employee onto a position, and set each person&apos;s lunch time
        — every change saves instantly.
      </p>

      {positions.length === 0 && employees.length > 0 && (
        <p className="mb-4 text-sm text-amber-400">
          No positions yet — create them on the Positions page first.
        </p>
      )}

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="grid grid-cols-2 gap-4 pb-4 sm:grid-cols-4">
          {columns.map((column) => (
            <PositionColumn
              key={column.id}
              id={column.id}
              title={column.title}
              employees={employees.filter((e) =>
                column.id === UNASSIGNED
                  ? !e.positionId
                  : e.positionId === column.id
              )}
              saveStates={saveStates}
              onLunchChange={setLunch}
            />
          ))}
        </div>
        <DragOverlay>
          {activeEmployee && <EmployeeCard employee={activeEmployee} overlay />}
        </DragOverlay>
      </DndContext>

      {employees.length === 0 && (
        <p className="text-sm text-zinc-500">
          No employees yet — add them on the Employees page.
        </p>
      )}
    </div>
  );
}
