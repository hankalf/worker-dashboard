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
};

type SaveState = "saving" | "saved" | "error";

const UNASSIGNED = "unassigned";

function EmployeeCard({
  employee,
  saveState,
  overlay = false,
}: {
  employee: Employee;
  saveState?: SaveState;
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
    </div>
  );
}

function PositionColumn({
  id,
  title,
  employees,
  saveStates,
}: {
  id: string;
  title: string;
  employees: Employee[];
  saveStates: Record<string, SaveState>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={`flex w-60 shrink-0 flex-col rounded-lg border p-3 transition-colors ${
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

    setSaveStates((s) => ({ ...s, [employeeId]: res.ok ? "saved" : "error" }));
    if (res.ok) {
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
      <h2 className="mb-1 text-lg font-semibold text-white">Assign Positions</h2>
      <p className="mb-4 text-sm text-zinc-400">
        Drag an employee onto a position — every drop saves instantly.
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
        <div className="flex items-start gap-4 overflow-x-auto pb-4">
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
