"use client";

import { useEffect, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { ShiftHandoffEditor } from "@/components/ShiftHandoffEditor";
import { shiftEndDate, currentShift } from "@/lib/shift";

type Role = { id: string; name: string };
type Position = {
  id: string;
  title: string;
  requiredRole: Role | null;
  requiredCapability: Role | null;
};
type Shift = "FIRST" | "SECOND" | "THIRD";
type Attendance = "PRESENT" | "ABSENT" | "CALLED_OUT" | "PTO";
type Employee = {
  id: string;
  name: string;
  positionId: string | null;
  roles: Role[];
  capabilities: Role[];
  lunchStart: string | null;
  lunchEnd: string | null;
  breakStart: string | null;
  shift: Shift | null;
  attendance: Attendance;
  isLead: boolean;
  stayOverUntil: string | null;
  coverUntil: string | null;
};

// How long past shift end an employee stays to help the next shift (30-min steps).
const STAY_OVER_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "No" },
  { value: 30, label: "30 min" },
  { value: 60, label: "1 hr" },
  { value: 90, label: "1.5 hr" },
  { value: 120, label: "2 hr" },
];

type SaveState = "saving" | "saved" | "error";

const SHIFT_LABEL: Record<Shift, string> = {
  FIRST: "1st Shift",
  SECOND: "2nd Shift",
  THIRD: "3rd Shift",
};

const ATTENDANCE_OPTIONS: { value: Attendance; label: string }[] = [
  { value: "PRESENT", label: "Present" },
  { value: "ABSENT", label: "Absent" },
  { value: "CALLED_OUT", label: "Called out" },
  { value: "PTO", label: "PTO" },
];

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
  positions,
  onPositionChange,
  onLunchChange,
  onBreakChange,
  onAttendanceChange,
  onLeadToggle,
  onStayOverChange,
  onCoverChange,
  warnRole,
  warnCapability,
  overlay = false,
  noDrag = false,
  active = false,
}: {
  employee: Employee;
  saveState?: SaveState;
  positions?: Position[];
  onPositionChange?: (id: string, value: string) => void;
  onLunchChange?: (id: string, value: string) => void;
  onBreakChange?: (id: string, value: string) => void;
  onAttendanceChange?: (id: string, value: Attendance) => void;
  onLeadToggle?: (id: string, value: boolean) => void;
  onStayOverChange?: (id: string, minutes: number) => void;
  onCoverChange?: (id: string, checked: boolean) => void;
  warnRole?: string | null;
  warnCapability?: string | null;
  overlay?: boolean;
  noDrag?: boolean;
  active?: boolean;
}) {
  // Reconstruct the currently-selected stay-over duration from stayOverUntil.
  const stayOverValue = (() => {
    if (!employee.stayOverUntil || !employee.shift) return 0;
    const until = new Date(employee.stayOverUntil).getTime();
    if (until <= Date.now()) return 0;
    const end = shiftEndDate(employee.shift, new Date()).getTime();
    const mins = Math.round((until - end) / 60000);
    return STAY_OVER_OPTIONS.some((o) => o.value === mins) ? mins : 0;
  })();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: employee.id,
    disabled: overlay || noDrag,
  });
  const out = employee.attendance !== "PRESENT";
  const fixed = overlay || noDrag;
  // Active (on the current shift / staying over) cards get the violet highlight,
  // matching the ACTIVE shift-handoff card.
  const base = active
    ? "border-violet-700 bg-violet-950/30"
    : "border-zinc-700 bg-zinc-800";

  return (
    <div
      ref={fixed ? undefined : setNodeRef}
      {...(fixed ? {} : { ...listeners, ...attributes })}
      className={`select-none rounded-md border p-3 ${
        overlay
          ? "border-blue-500 bg-zinc-800 shadow-lg shadow-black/50"
          : isDragging
            ? "border-zinc-700 bg-zinc-800/40 opacity-40"
            : noDrag
              ? `${base} ${out ? "opacity-60" : ""}`
              : `cursor-grab ${base} hover:border-zinc-500 active:cursor-grabbing ${out ? "opacity-60" : ""}`
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm font-medium text-white">
            {employee.name}
          </span>
          {employee.isLead && (
            <span className="whitespace-nowrap rounded-full bg-teal-500/20 px-2 py-0.5 text-xs font-semibold text-teal-300">
              Lead
            </span>
          )}
        </span>
        <div className="flex items-center gap-1.5">
          {employee.shift && (
            <span className="whitespace-nowrap rounded-full bg-blue-950 px-2 py-0.5 text-xs font-medium text-blue-300">
              {SHIFT_LABEL[employee.shift]}
            </span>
          )}
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
      </div>
      {employee.roles.length > 0 && (
        <div className="mt-1 text-xs text-zinc-500">
          {employee.roles.map((role) => role.name).join(" · ")}
        </div>
      )}
      {warnRole && (
        <div className="mt-1 text-xs font-medium text-amber-400">
          ⚠ Missing equipment: {warnRole}
        </div>
      )}
      {warnCapability && (
        <div className="mt-1 text-xs font-medium text-amber-400">
          ⚠ Missing role: {warnCapability}
        </div>
      )}
      {!overlay &&
        (onPositionChange ||
          onLunchChange ||
          onBreakChange ||
          onAttendanceChange ||
          onLeadToggle ||
          onStayOverChange) && (
        <div
          onPointerDown={stopDrag}
          onKeyDown={stopDrag}
          className="mt-2 flex flex-col gap-1.5 text-xs text-zinc-400"
        >
          {onPositionChange && positions && (
            <label className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-zinc-500">Position</span>
              <select
                value={employee.positionId ?? ""}
                onChange={(e) => onPositionChange(employee.id, e.target.value)}
                style={{ colorScheme: "dark" }}
                className="min-w-0 flex-1 rounded border border-zinc-700 bg-zinc-900 px-1 py-0.5 text-zinc-100"
              >
                <option value="">Unassigned</option>
                {positions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          {onBreakChange && (
            <label className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-zinc-500">Break</span>
              <select
                value={employee.breakStart ?? ""}
                onChange={(e) => onBreakChange(employee.id, e.target.value)}
                style={{ colorScheme: "dark" }}
                className="min-w-0 flex-1 rounded border border-zinc-700 bg-zinc-900 px-1 py-0.5 text-zinc-100"
              >
                <option value="">None</option>
                {LUNCH_TIMES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {onLunchChange && (
            <label className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-zinc-500">Lunch</span>
              <select
                value={employee.lunchStart ?? ""}
                onChange={(e) => onLunchChange(employee.id, e.target.value)}
                style={{ colorScheme: "dark" }}
                className="min-w-0 flex-1 rounded border border-zinc-700 bg-zinc-900 px-1 py-0.5 text-zinc-100"
              >
                <option value="">None</option>
                {LUNCH_TIMES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {onStayOverChange && employee.shift && (
            <label className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-zinc-500">Stay over</span>
              <select
                value={stayOverValue}
                onChange={(e) =>
                  onStayOverChange(employee.id, Number(e.target.value))
                }
                style={{ colorScheme: "dark" }}
                className="min-w-0 flex-1 rounded border border-zinc-700 bg-zinc-900 px-1 py-0.5 text-zinc-100"
              >
                {STAY_OVER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {(onAttendanceChange || onLeadToggle || onCoverChange) && (
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-zinc-700/60 pt-1.5">
              {onAttendanceChange &&
                ATTENDANCE_OPTIONS.map((a) => (
                  <label key={a.value} className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={employee.attendance === a.value}
                      onChange={() => onAttendanceChange(employee.id, a.value)}
                      className="h-3.5 w-3.5"
                    />
                    {a.label}
                  </label>
                ))}
              {onLeadToggle && (
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={employee.isLead}
                    onChange={(e) => onLeadToggle(employee.id, e.target.checked)}
                    className="h-3.5 w-3.5"
                  />
                  Lead
                </label>
              )}
              {onCoverChange && (
                <label
                  className="flex items-center gap-1"
                  title="Show on the current shift's board (came in early)"
                >
                  <input
                    type="checkbox"
                    checked={
                      !!employee.coverUntil &&
                      new Date(employee.coverUntil).getTime() > Date.now()
                    }
                    onChange={(e) => onCoverChange(employee.id, e.target.checked)}
                    className="h-3.5 w-3.5"
                  />
                  In early
                </label>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PositionColumn({
  id,
  title,
  requiredRole,
  requiredCapability,
  employees,
  saveStates,
  positions,
  onPositionChange,
  onLunchChange,
  onBreakChange,
  onAttendanceChange,
  onLeadToggle,
  onStayOverChange,
  onCoverChange,
  isActive,
  horizontal = false,
}: {
  id: string;
  title: string;
  requiredRole: Role | null;
  requiredCapability: Role | null;
  employees: Employee[];
  saveStates: Record<string, SaveState>;
  positions: Position[];
  onPositionChange: (id: string, value: string) => void;
  onLunchChange: (id: string, value: string) => void;
  onBreakChange: (id: string, value: string) => void;
  onAttendanceChange: (id: string, value: Attendance) => void;
  onLeadToggle: (id: string, value: boolean) => void;
  onStayOverChange: (id: string, minutes: number) => void;
  onCoverChange: (id: string, checked: boolean) => void;
  isActive: (e: Employee) => boolean;
  horizontal?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const ordered = [...employees].sort(
    (a, b) => Number(b.isLead) - Number(a.isLead)
  );

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col rounded-lg border p-3 transition-colors ${
        isOver
          ? "border-blue-500 bg-blue-950/30"
          : "border-zinc-800 bg-zinc-900"
      }`}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-white">{title}</h3>
          {requiredRole && (
            <div className="text-xs text-zinc-500">
              needs {requiredRole.name}
            </div>
          )}
          {requiredCapability && (
            <div className="text-xs text-zinc-500">
              role: {requiredCapability.name}
            </div>
          )}
        </div>
        <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
          {employees.length}
        </span>
      </div>
      <div
        className={
          horizontal
            ? "grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
            : "flex min-h-16 flex-1 flex-col gap-2"
        }
      >
        {ordered.map((employee) => (
          <EmployeeCard
            key={employee.id}
            employee={employee}
            saveState={saveStates[employee.id]}
            positions={positions}
            onPositionChange={onPositionChange}
            onLunchChange={onLunchChange}
            onBreakChange={onBreakChange}
            onAttendanceChange={onAttendanceChange}
            onLeadToggle={onLeadToggle}
            onStayOverChange={onStayOverChange}
            onCoverChange={onCoverChange}
            active={isActive(employee)}
            warnRole={
              requiredRole &&
              !employee.roles.some((r) => r.id === requiredRole.id)
                ? requiredRole.name
                : null
            }
            warnCapability={
              requiredCapability &&
              !employee.capabilities.some((c) => c.id === requiredCapability.id)
                ? requiredCapability.name
                : null
            }
          />
        ))}
        {employees.length === 0 && (
          <div
            className={`flex items-center justify-center rounded-md border border-dashed border-zinc-800 p-3 text-xs text-zinc-600 ${
              horizontal ? "col-span-full min-h-12" : "min-h-16 flex-1"
            }`}
          >
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
  const [undoSnapshot, setUndoSnapshot] = useState<
    { id: string; positionId: string }[] | null
  >(null);

  // Live-ish clock (30s) so the "active shift" highlight tracks the time.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);
  const nowShift = currentShift(now);
  // Active = present and either on the current shift or still within a stay-over
  // window — i.e. the people showing as active on the main dashboard.
  const isActive = (e: Employee) =>
    e.attendance === "PRESENT" &&
    (e.shift === nowShift ||
      (!!e.stayOverUntil && new Date(e.stayOverUntil) > now) ||
      (!!e.coverUntil && new Date(e.coverUntil) > now));

  // Separate mouse/touch sensors: mouse drags after a small move, while touch
  // requires a short press-and-hold — so a quick finger swipe still scrolls the
  // board on phones instead of accidentally grabbing a card. On touch you can
  // also just use the per-card position dropdown to reassign without dragging.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 8 },
    }),
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

  const setBreak = async (employeeId: string, value: string) => {
    setEmployees((current) =>
      current.map((e) =>
        e.id === employeeId ? { ...e, breakStart: value || null } : e
      )
    );
    setSaveStates((s) => ({ ...s, [employeeId]: "saving" }));

    const res = await fetch(`/api/employees/${employeeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ breakStart: value }),
    });
    flashSaved(employeeId, res.ok);
  };

  const markAllPresent = async () => {
    if (!confirm("Mark everyone Present for the start of the shift?")) return;
    const res = await fetch("/api/employees/reset-attendance", {
      method: "POST",
    });
    if (res.ok) {
      setEmployees((current) =>
        current.map((e) => ({ ...e, attendance: "PRESENT" as Attendance }))
      );
    } else {
      alert("Could not update attendance. Please try again.");
    }
  };

  const setAttendance = async (employeeId: string, value: Attendance) => {
    setEmployees((current) =>
      current.map((e) => (e.id === employeeId ? { ...e, attendance: value } : e))
    );
    setSaveStates((s) => ({ ...s, [employeeId]: "saving" }));

    const res = await fetch(`/api/employees/${employeeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attendance: value }),
    });
    flashSaved(employeeId, res.ok);
  };

  const setLead = async (employeeId: string, value: boolean) => {
    setEmployees((current) =>
      current.map((e) => (e.id === employeeId ? { ...e, isLead: value } : e))
    );
    setSaveStates((s) => ({ ...s, [employeeId]: "saving" }));

    const res = await fetch(`/api/employees/${employeeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isLead: value }),
    });
    flashSaved(employeeId, res.ok);
  };

  const setStayOver = async (employeeId: string, minutes: number) => {
    const emp = employees.find((e) => e.id === employeeId);
    if (!emp || !emp.shift) return;
    const stayOverUntil =
      minutes > 0
        ? new Date(
            shiftEndDate(emp.shift, new Date()).getTime() + minutes * 60000
          ).toISOString()
        : null;
    setEmployees((current) =>
      current.map((e) => (e.id === employeeId ? { ...e, stayOverUntil } : e))
    );
    setSaveStates((s) => ({ ...s, [employeeId]: "saving" }));

    const res = await fetch(`/api/employees/${employeeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stayOverUntil: stayOverUntil ?? "" }),
    });
    flashSaved(employeeId, res.ok);
  };

  const setCover = async (employeeId: string, checked: boolean) => {
    // Cover the current shift until it ends (e.g. came in early from another).
    const coverUntil = checked
      ? shiftEndDate(currentShift(new Date()), new Date()).toISOString()
      : null;
    setEmployees((current) =>
      current.map((e) => (e.id === employeeId ? { ...e, coverUntil } : e))
    );
    setSaveStates((s) => ({ ...s, [employeeId]: "saving" }));

    const res = await fetch(`/api/employees/${employeeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coverUntil: coverUntil ?? "" }),
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

    const snapshot = employees
      .filter((e) => e.positionId)
      .map((e) => ({ id: e.id, positionId: e.positionId as string }));

    const res = await fetch("/api/employees/reset-positions", {
      method: "POST",
    });
    if (res.ok) {
      setEmployees((current) => current.map((e) => ({ ...e, positionId: null })));
      setUndoSnapshot(snapshot.length ? snapshot : null);
    } else {
      alert("Could not reset positions. Please try again.");
    }
  };

  const undoReset = async () => {
    if (!undoSnapshot) return;
    setEmployees((current) =>
      current.map((e) => {
        const s = undoSnapshot.find((x) => x.id === e.id);
        return s ? { ...e, positionId: s.positionId } : e;
      })
    );
    const toRestore = undoSnapshot;
    setUndoSnapshot(null);
    await Promise.all(
      toRestore.map((s) =>
        fetch(`/api/employees/${s.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ positionId: s.positionId }),
        })
      )
    );
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
    {
      id: UNASSIGNED,
      title: "Unassigned",
      requiredRole: null as Role | null,
      requiredCapability: null as Role | null,
    },
    ...positions.map((p) => ({
      id: p.id,
      title: p.title,
      requiredRole: p.requiredRole,
      requiredCapability: p.requiredCapability,
    })),
  ];

  // Absent / called-out people are pulled out of the position board into their
  // own section so the board shows only who's actually working.
  const absentEmployees = employees.filter((e) => e.attendance !== "PRESENT");

  const renderColumn = (
    column: (typeof columns)[number],
    horizontal: boolean
  ) => (
    <PositionColumn
      key={column.id}
      id={column.id}
      title={column.title}
      requiredRole={column.requiredRole}
      requiredCapability={column.requiredCapability}
      horizontal={horizontal}
      employees={employees.filter(
        (e) =>
          e.attendance === "PRESENT" &&
          (column.id === UNASSIGNED
            ? !e.positionId
            : e.positionId === column.id)
      )}
      saveStates={saveStates}
      positions={positions}
      onPositionChange={(empId, value) => assign(empId, value || null)}
      onLunchChange={setLunch}
      onBreakChange={setBreak}
      onAttendanceChange={setAttendance}
      onLeadToggle={setLead}
      onStayOverChange={setStayOver}
      onCoverChange={setCover}
      isActive={isActive}
    />
  );

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-white">Assign Positions</h2>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={markAllPresent}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:border-green-500 hover:text-green-400"
          >
            Mark all Present
          </button>
          <button
            onClick={resetAll}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:border-red-500 hover:text-red-400"
          >
            Reset all to Unassigned
          </button>
        </div>
      </div>
      <p className="mb-4 text-sm text-zinc-400">
        Drag an employee onto a position — or use each card&apos;s Position
        dropdown (best on phones) — and set their lunch, break, and
        attendance. Every change saves instantly.
      </p>

      <div className="mb-6">
        <ShiftHandoffEditor />
      </div>

      {undoSnapshot && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-amber-800 bg-amber-950/40 px-4 py-2 text-sm text-amber-200">
          <span>
            Positions cleared for {undoSnapshot.length} employee
            {undoSnapshot.length === 1 ? "" : "s"}.
          </span>
          <div className="flex gap-3">
            <button
              onClick={undoReset}
              className="font-medium text-amber-100 underline hover:text-white"
            >
              Undo
            </button>
            <button
              onClick={() => setUndoSnapshot(null)}
              className="text-amber-400 hover:text-amber-200"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

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
        <div className="pb-4">
          {/* Unassigned: full-width horizontal strip on top (unchanged). */}
          {renderColumn(columns[0], true)}
          {/* Positions: vertical columns below. */}
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {columns.slice(1).map((column) => renderColumn(column, false))}
          </div>
        </div>

        {absentEmployees.length > 0 && (
          <div className="mt-8 border-t border-zinc-800 pt-6">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
              Absent / Called out / PTO ({absentEmployees.length})
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {absentEmployees.map((e) => (
                <EmployeeCard
                  key={e.id}
                  employee={e}
                  saveState={saveStates[e.id]}
                  onAttendanceChange={setAttendance}
                  noDrag
                />
              ))}
            </div>
          </div>
        )}

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
