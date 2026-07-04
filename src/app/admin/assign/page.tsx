"use client";

import { useEffect, useState } from "react";

type Position = { id: string; title: string };
type Role = { id: string; name: string };
type Employee = {
  id: string;
  name: string;
  positionId: string | null;
  roles: Role[];
};

type SaveState = "saving" | "saved" | "error";

export default function AssignPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});

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

  const assign = async (employeeId: string, positionId: string) => {
    // Optimistic update so the board feels instant
    setEmployees((current) =>
      current.map((e) =>
        e.id === employeeId ? { ...e, positionId: positionId || null } : e
      )
    );
    setSaveStates((s) => ({ ...s, [employeeId]: "saving" }));

    const res = await fetch(`/api/employees/${employeeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ positionId }),
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

  const countFor = (positionId: string) =>
    employees.filter((e) => e.positionId === positionId).length;
  const unassignedCount = employees.filter((e) => !e.positionId).length;

  return (
    <div className="max-w-3xl">
      <h2 className="mb-1 text-lg font-semibold text-white">Assign Positions</h2>
      <p className="mb-4 text-sm text-zinc-400">
        Pick a position for each employee — changes save instantly.
      </p>

      <div className="mb-6 flex flex-wrap gap-2">
        <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-300">
          Unassigned: {unassignedCount}
        </span>
        {positions.map((position) => (
          <span
            key={position.id}
            className="rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-300"
          >
            {position.title}: {countFor(position.id)}
          </span>
        ))}
      </div>

      <ul className="flex flex-col gap-2">
        {employees.map((employee) => (
          <li
            key={employee.id}
            className="flex items-center justify-between gap-4 rounded-lg border border-zinc-800 bg-zinc-900 p-3"
          >
            <div className="min-w-0">
              <div className="font-medium text-white">{employee.name}</div>
              {employee.roles.length > 0 && (
                <div className="mt-0.5 truncate text-xs text-zinc-500">
                  {employee.roles.map((role) => role.name).join(" · ")}
                </div>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="w-14 text-right text-xs">
                {saveStates[employee.id] === "saving" && (
                  <span className="text-zinc-500">Saving…</span>
                )}
                {saveStates[employee.id] === "saved" && (
                  <span className="text-green-400">Saved ✓</span>
                )}
                {saveStates[employee.id] === "error" && (
                  <span className="text-red-400">Failed</span>
                )}
              </span>
              <select
                value={employee.positionId ?? ""}
                onChange={(e) => assign(employee.id, e.target.value)}
                className="rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100"
              >
                <option value="">— Unassigned —</option>
                {positions.map((position) => (
                  <option key={position.id} value={position.id}>
                    {position.title}
                  </option>
                ))}
              </select>
            </div>
          </li>
        ))}
      </ul>

      {employees.length === 0 && (
        <p className="text-sm text-zinc-500">
          No employees yet — add them on the Employees page.
        </p>
      )}
    </div>
  );
}
