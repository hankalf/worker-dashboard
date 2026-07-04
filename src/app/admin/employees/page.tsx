"use client";

import { useEffect, useRef, useState } from "react";
import { useAdminGuard } from "@/lib/useAdminGuard";

type Position = { id: string; title: string };
type Role = { id: string; name: string };
type Shift = "FIRST" | "SECOND" | "THIRD";
type Attendance = "PRESENT" | "ABSENT" | "CALLED_OUT";
type AccessLevel = "NONE" | "SUPERVISOR" | "ADMIN";
type Employee = {
  id: string;
  name: string;
  accessLevel: AccessLevel;
  username: string | null;
  positionId: string | null;
  position: Position | null;
  roles: Role[];
  shift: Shift | null;
  attendance: Attendance;
  isLead: boolean;
  terminatedAt: string | null;
};

const ACCESS_OPTIONS: { value: AccessLevel; label: string }[] = [
  { value: "NONE", label: "No login" },
  { value: "SUPERVISOR", label: "Supervisor (assign only)" },
  { value: "ADMIN", label: "Admin (full access)" },
];
const ACCESS_LABEL: Record<AccessLevel, string> = {
  NONE: "",
  SUPERVISOR: "Supervisor",
  ADMIN: "Admin",
};

type ActivityLog = {
  id: string;
  category: string;
  action: string;
  createdAt: string;
};

const SHIFT_OPTIONS: { value: Shift; label: string }[] = [
  { value: "FIRST", label: "1st Shift (6am–2pm)" },
  { value: "SECOND", label: "2nd Shift (2pm–10pm)" },
  { value: "THIRD", label: "3rd Shift (10pm–6am)" },
];
const SHIFT_SHORT: Record<Shift, string> = {
  FIRST: "1st Shift",
  SECOND: "2nd Shift",
  THIRD: "3rd Shift",
};

const ATTENDANCE_OPTIONS: { value: Attendance; label: string }[] = [
  { value: "PRESENT", label: "Present" },
  { value: "ABSENT", label: "Absent" },
  { value: "CALLED_OUT", label: "Called out" },
];
const ATTENDANCE_LABEL: Record<Attendance, string> = {
  PRESENT: "Present",
  ABSENT: "Absent",
  CALLED_OUT: "Called out",
};

const inputClass =
  "rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500";

export default function EmployeesPage() {
  const guarded = useAdminGuard();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [historyFor, setHistoryFor] = useState<Employee | null>(null);
  const [history, setHistory] = useState<ActivityLog[] | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [name, setName] = useState("");
  const [positionId, setPositionId] = useState("");
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [accessLevel, setAccessLevel] = useState<AccessLevel>("NONE");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [shift, setShift] = useState<Shift | "">("");
  const [attendance, setAttendance] = useState<Attendance>("PRESENT");
  const [isLead, setIsLead] = useState(false);
  const [search, setSearch] = useState("");
  const [showTerminated, setShowTerminated] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async (withTerminated = showTerminated) => {
    const [employeesRes, positionsRes, rolesRes] = await Promise.all([
      fetch(`/api/employees${withTerminated ? "?includeTerminated=1" : ""}`),
      fetch("/api/positions"),
      fetch("/api/roles"),
    ]);
    if (employeesRes.status === 403) {
      // Session no longer maps to an admin — send them back to sign in
      window.location.href = "/login";
      return;
    }
    setEmployees(await employeesRes.json());
    setPositions(await positionsRes.json());
    setRoles(await rolesRes.json());
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleTerminated = (next: boolean) => {
    setShowTerminated(next);
    load(next);
  };

  const terminate = async (employee: Employee, terminated: boolean) => {
    const verb = terminated ? "Terminate" : "Reactivate";
    if (!confirm(`${verb} ${employee.name}?`)) return;
    const res = await fetch(`/api/employees/${employee.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ terminated }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Something went wrong");
      return;
    }
    load();
  };

  const resetForm = () => {
    setName("");
    setPositionId("");
    setRoleIds([]);
    setAccessLevel("NONE");
    setUsername("");
    setPassword("");
    setShift("");
    setAttendance("PRESENT");
    setIsLead(false);
    setEditingId(null);
  };

  const toggleRole = (id: string) => {
    setRoleIds((current) =>
      current.includes(id)
        ? current.filter((roleId) => roleId !== id)
        : [...current, id]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const url = editingId ? `/api/employees/${editingId}` : "/api/employees";
    const method = editingId ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        positionId,
        roleIds,
        accessLevel,
        username,
        password,
        shift,
        attendance,
        isLead,
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

  const handleEdit = (employee: Employee) => {
    setEditingId(employee.id);
    setName(employee.name);
    setPositionId(employee.positionId ?? "");
    setRoleIds(employee.roles.map((role) => role.id));
    setAccessLevel(employee.accessLevel);
    setUsername(employee.username ?? "");
    setPassword("");
    setShift(employee.shift ?? "");
    setAttendance(employee.attendance ?? "PRESENT");
    setIsLead(employee.isLead ?? false);
  };

  const openHistory = async (employee: Employee) => {
    setHistoryFor(employee);
    setHistory(null);
    const res = await fetch(`/api/activity-logs?subjectId=${employee.id}`);
    setHistory(res.ok ? await res.json() : []);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this employee?")) return;
    const res = await fetch(`/api/employees/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Something went wrong");
      return;
    }
    load();
  };

  const handleImport = async (file: File) => {
    setImporting(true);
    setImportResult(null);
    setError(null);

    const csv = await file.text();
    const res = await fetch("/api/employees/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv }),
    });
    const body = await res.json().catch(() => ({}));
    setImporting(false);

    if (!res.ok) {
      setError(body.error ?? "Import failed");
      return;
    }

    const parts = [`Imported ${body.created} employee${body.created === 1 ? "" : "s"}.`];
    if (body.errors?.length) {
      parts.push(`Skipped ${body.errors.length}: ${body.errors.join(" · ")}`);
    }
    setImportResult(parts.join(" "));
    load();
  };

  if (!guarded) {
    return <p className="text-sm text-zinc-500">Checking access…</p>;
  }

  return (
    <div className="max-w-3xl">
      <h2 className="mb-4 text-lg font-semibold text-white">Employees</h2>

      <div className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
        <h3 className="mb-1 text-sm font-medium text-white">Import from CSV</h3>
        <p className="mb-3 text-sm text-zinc-400">
          Upload a CSV with columns: <code className="text-zinc-300">name</code>,{" "}
          <code className="text-zinc-300">position</code>,{" "}
          <code className="text-zinc-300">roles</code> (separate multiple with
          semicolons), <code className="text-zinc-300">admin</code> (yes/no),{" "}
          <code className="text-zinc-300">username</code> and{" "}
          <code className="text-zinc-300">password</code> (required for admins),
          and <code className="text-zinc-300">shift</code> (1, 2, or 3).
          Positions and roles that don&apos;t exist yet are created automatically.{" "}
          <a
            href="/employee-import-sample.csv"
            download
            className="text-blue-400 underline hover:text-blue-300"
          >
            Download the sample CSV
          </a>
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          disabled={importing}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              handleImport(file);
              e.target.value = "";
            }
          }}
          className="text-sm text-zinc-400 file:mr-3 file:rounded-md file:border-0 file:bg-blue-600 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-blue-500"
        />
        {importing && <p className="mt-2 text-sm text-zinc-400">Importing...</p>}
        {importResult && (
          <p className="mt-2 text-sm text-green-400">{importResult}</p>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="mb-6 flex flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-4"
      >
        <h3 className="text-sm font-medium text-white">
          {editingId ? "Edit employee" : "Add employee"}
        </h3>
        <input
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className={inputClass}
        />
        <div className="grid grid-cols-2 gap-3">
          <select
            value={positionId}
            onChange={(e) => setPositionId(e.target.value)}
            className={inputClass}
          >
            <option value="">No position</option>
            {positions.map((position) => (
              <option key={position.id} value={position.id}>
                {position.title}
              </option>
            ))}
          </select>
          <select
            value={shift}
            onChange={(e) => setShift(e.target.value as Shift | "")}
            className={inputClass}
          >
            <option value="">No shift</option>
            {SHIFT_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <select
            value={attendance}
            onChange={(e) => setAttendance(e.target.value as Attendance)}
            className={`col-span-2 ${inputClass}`}
          >
            {ATTENDANCE_OPTIONS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
          <label className="col-span-2 flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={isLead}
              onChange={(e) => setIsLead(e.target.checked)}
              className="h-4 w-4"
            />
            Lead (shown first in their position)
          </label>
        </div>

        <div>
          <div className="mb-1 text-xs font-medium text-zinc-400">
            Roles this employee can perform
          </div>
          {roles.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No roles yet — add them on the Roles page.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {roles.map((role) => (
                <label
                  key={role.id}
                  className={`cursor-pointer rounded-full border px-3 py-1 text-sm ${
                    roleIds.includes(role.id)
                      ? "border-blue-500 bg-blue-600/20 text-blue-300"
                      : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={roleIds.includes(role.id)}
                    onChange={() => toggleRole(role.id)}
                    className="sr-only"
                  />
                  {role.name}
                </label>
              ))}
            </div>
          )}
        </div>

        <label className="text-xs text-zinc-400">
          Panel access
          <select
            value={accessLevel}
            onChange={(e) => setAccessLevel(e.target.value as AccessLevel)}
            className={`mt-1 block w-full ${inputClass}`}
          >
            {ACCESS_OPTIONS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </label>

        {accessLevel !== "NONE" && (
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className={inputClass}
            />
            <input
              type="password"
              placeholder={
                editingId ? "New password (blank = keep current)" : "Password"
              }
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required={!editingId}
              className={inputClass}
            />
          </div>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
          >
            {editingId ? "Save changes" : "Add employee"}
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

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input
          placeholder="Search employees by name, position, or role…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`min-w-40 flex-1 ${inputClass}`}
        />
        <label className="flex items-center gap-2 whitespace-nowrap text-sm text-zinc-400">
          <input
            type="checkbox"
            checked={showTerminated}
            onChange={(e) => toggleTerminated(e.target.checked)}
            className="h-4 w-4"
          />
          Show terminated
        </label>
      </div>

      <ul className="flex flex-col gap-2">
        {employees
          .filter((employee) => {
            const q = search.trim().toLowerCase();
            if (!q) return true;
            return (
              employee.name.toLowerCase().includes(q) ||
              (employee.position?.title ?? "").toLowerCase().includes(q) ||
              employee.roles.some((r) => r.name.toLowerCase().includes(q))
            );
          })
          .map((employee) => (
          <li
            key={employee.id}
            className={`flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 p-3 ${
              employee.terminatedAt ? "opacity-60" : ""
            }`}
          >
            <div>
              <div className="flex items-center gap-2 font-medium text-white">
                {employee.name}
                {employee.terminatedAt && (
                  <span className="rounded-full bg-zinc-700 px-2 py-0.5 text-xs font-medium text-zinc-300">
                    Terminated
                  </span>
                )}
                {employee.isLead && (
                  <span className="rounded-full bg-teal-500/20 px-2 py-0.5 text-xs font-semibold text-teal-300">
                    Lead
                  </span>
                )}
                {employee.accessLevel !== "NONE" && (
                  <span className="rounded-full bg-blue-600/20 px-2 py-0.5 text-xs font-medium text-blue-300">
                    {ACCESS_LABEL[employee.accessLevel]}
                  </span>
                )}
                {employee.attendance !== "PRESENT" && (
                  <span className="rounded-full bg-red-600/20 px-2 py-0.5 text-xs font-medium text-red-300">
                    {ATTENDANCE_LABEL[employee.attendance]}
                  </span>
                )}
              </div>
              <div className="text-sm text-zinc-400">
                {employee.position?.title ?? "No position"}
                {employee.shift ? ` · ${SHIFT_SHORT[employee.shift]}` : ""}
                {employee.username ? ` · ${employee.username}` : ""}
              </div>
              {employee.roles.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {employee.roles.map((role) => (
                    <span
                      key={role.id}
                      className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300"
                    >
                      {role.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex shrink-0 gap-3 text-sm">
              <button
                onClick={() => openHistory(employee)}
                className="text-zinc-400 hover:text-white"
              >
                History
              </button>
              {employee.terminatedAt ? (
                <button
                  onClick={() => terminate(employee, false)}
                  className="text-green-400 hover:text-green-300"
                >
                  Reactivate
                </button>
              ) : (
                <>
                  <button
                    onClick={() => handleEdit(employee)}
                    className="text-zinc-400 hover:text-white"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => terminate(employee, true)}
                    className="text-amber-400 hover:text-amber-300"
                  >
                    Terminate
                  </button>
                </>
              )}
              <button
                onClick={() => handleDelete(employee.id)}
                className="text-red-400 hover:text-red-300"
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>

      {historyFor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setHistoryFor(null)}
        >
          <div
            className="max-h-[80vh] w-full max-w-lg overflow-auto rounded-lg border border-zinc-800 bg-zinc-900 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold text-white">
                History — {historyFor.name}
              </h3>
              <button
                onClick={() => setHistoryFor(null)}
                className="text-sm text-zinc-400 hover:text-white"
              >
                Close
              </button>
            </div>
            {history === null ? (
              <p className="text-sm text-zinc-500">Loading…</p>
            ) : history.length === 0 ? (
              <p className="text-sm text-zinc-500">No recorded history.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {history.map((log) => (
                  <li
                    key={log.id}
                    className="flex items-baseline justify-between gap-3 rounded-md border border-zinc-800 px-3 py-2 text-sm"
                  >
                    <span className="text-zinc-200">{log.action}</span>
                    <span className="whitespace-nowrap text-xs text-zinc-500">
                      {new Date(log.createdAt).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
