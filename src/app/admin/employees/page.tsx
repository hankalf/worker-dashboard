"use client";

import { useEffect, useRef, useState } from "react";
import { useAdminGuard } from "@/lib/useAdminGuard";
import { APP_TZ } from "@/lib/time";
import { todayKey, anniversaryYears, isBirthday } from "@/lib/celebrations";

type Position = { id: string; title: string };
type Role = { id: string; name: string };
type Capability = { id: string; name: string };
type Shift = "FIRST" | "SECOND" | "THIRD";
type Attendance = "PRESENT" | "ABSENT" | "CALLED_OUT" | "PTO";
type AccessLevel = "NONE" | "LEAD" | "SUPERVISOR" | "ADMIN";
// The access dropdown adds "SUPERUSER" (ADMIN across all locations) on top of
// the stored AccessLevel; it maps to accessLevel=ADMIN + isSuperAdmin on save.
type AccessChoice = AccessLevel | "SUPERUSER";
type Employee = {
  id: string;
  name: string;
  accessLevel: AccessLevel;
  isSuperAdmin: boolean;
  username: string | null;
  positionId: string | null;
  position: Position | null;
  roles: Role[];
  capabilities: Capability[];
  shift: Shift | null;
  attendance: Attendance;
  isLead: boolean;
  breakStart: string | null;
  lunchStart: string | null;
  hireDate: string | null;
  birthDate: string | null;
  terminatedAt: string | null;
};

const ACCESS_OPTIONS: { value: AccessChoice; label: string; superOnly?: boolean }[] = [
  { value: "NONE", label: "No login" },
  { value: "LEAD", label: "Lead (dashboard, notices, assign, lunches, side tasks)" },
  { value: "SUPERVISOR", label: "Supervisor (Lead + attendance)" },
  { value: "ADMIN", label: "Admin (full access to this location)" },
  { value: "SUPERUSER", label: "SuperUser (full access to all locations)", superOnly: true },
];
const ACCESS_LABEL: Record<AccessLevel, string> = {
  NONE: "",
  LEAD: "Lead",
  SUPERVISOR: "Supervisor",
  ADMIN: "Admin",
};

type ActivityLog = {
  id: string;
  category: string;
  action: string;
  actorName: string | null;
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

// Sort keys for the employee list: shift in chronological order (no shift
// last), position by title (no position last).
const SHIFT_RANK: Record<Shift, number> = { FIRST: 0, SECOND: 1, THIRD: 2 };
const shiftRank = (shift: Shift | null) => (shift ? SHIFT_RANK[shift] : 3);
const positionKey = (position: Position | null) =>
  position?.title.toLowerCase() ?? "￿";

// The employee list is laid out as one column per shift (plus a "No shift"
// column, shown only when it has anyone).
const SHIFT_COLUMNS: { key: Shift | null; label: string }[] = [
  { key: "FIRST", label: "1st Shift" },
  { key: "SECOND", label: "2nd Shift" },
  { key: "THIRD", label: "3rd Shift" },
  { key: null, label: "No shift" },
];

const ATTENDANCE_OPTIONS: { value: Attendance; label: string }[] = [
  { value: "PRESENT", label: "Present" },
  { value: "ABSENT", label: "Absent" },
  { value: "CALLED_OUT", label: "Called out" },
  { value: "PTO", label: "PTO" },
];
const ATTENDANCE_LABEL: Record<Attendance, string> = {
  PRESENT: "Present",
  ABSENT: "Absent",
  CALLED_OUT: "Called out",
  PTO: "PTO",
};

const inputClass =
  "rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500";

// "13:30" -> "1:30 PM"
const formatClock = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// "2021-03-15" -> "Mar 15, 2021" (or "Mar 15" without the year).
const fmtDate = (d: string, withYear: boolean) => {
  const [y, m, day] = d.split("-");
  return `${MONTHS[Number(m) - 1]} ${Number(day)}${withYear ? `, ${y}` : ""}`;
};

// One employee card, used in both the shift columns and the admins section.
function EmployeeCardRow({
  employee,
  today,
  onHistory,
  onEdit,
  onTerminate,
  onDelete,
}: {
  employee: Employee;
  today: string;
  onHistory: (e: Employee) => void;
  onEdit: (e: Employee) => void;
  onTerminate: (e: Employee, terminated: boolean) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <li
      className={`flex flex-col gap-2 rounded-lg border border-zinc-800 bg-zinc-900 p-3 ${
        employee.terminatedAt ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {/* Name + status */}
          <div className="flex flex-wrap items-center gap-2 font-medium text-white">
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
            {employee.isSuperAdmin ? (
              <span className="rounded-full bg-violet-600/30 px-2 py-0.5 text-xs font-semibold text-violet-300">
                SuperUser
              </span>
            ) : (
              employee.accessLevel !== "NONE" && (
                <span className="rounded-full bg-indigo-600/20 px-2 py-0.5 text-xs font-medium text-indigo-300">
                  {ACCESS_LABEL[employee.accessLevel]}
                </span>
              )
            )}
            {employee.attendance !== "PRESENT" && (
              <span className="rounded-full bg-red-600/20 px-2 py-0.5 text-xs font-medium text-red-300">
                {ATTENDANCE_LABEL[employee.attendance]}
              </span>
            )}
            {anniversaryYears(employee.hireDate, today) && (
              <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-300">
                🎉 {anniversaryYears(employee.hireDate, today)} yr
              </span>
            )}
            {isBirthday(employee.birthDate, today) && (
              <span className="rounded-full bg-pink-500/20 px-2 py-0.5 text-xs font-semibold text-pink-300">
                🎂 Birthday
              </span>
            )}
          </div>
          {/* Position */}
          <div className="mt-0.5 text-sm text-zinc-400">
            {employee.position?.title ?? "No position"}
            {employee.username ? ` · ${employee.username}` : ""}
          </div>
          {/* Roles (capabilities) — bold list */}
          {employee.capabilities.length > 0 && (
            <div className="mt-1 text-xs font-bold text-zinc-200">
              {employee.capabilities.map((cap) => cap.name).join(" · ")}
            </div>
          )}
          {/* Hire / birth dates (always shown) */}
          {(employee.hireDate || employee.birthDate) && (
            <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-zinc-500">
              {employee.hireDate && <span>🎉 {fmtDate(employee.hireDate, true)}</span>}
              {employee.birthDate && <span>🎂 {fmtDate(employee.birthDate, false)}</span>}
            </div>
          )}
        </div>
        {/* Right corner: shift, then break, then lunch */}
        {(employee.shift || employee.breakStart || employee.lunchStart) && (
          <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
            {employee.shift && (
              <span className="whitespace-nowrap rounded-full bg-blue-600/20 px-2 py-0.5 font-medium text-blue-300">
                {SHIFT_SHORT[employee.shift]}
              </span>
            )}
            {employee.breakStart && (
              <span className="whitespace-nowrap rounded-full bg-orange-500/20 px-2 py-0.5 font-medium text-orange-300">
                Break {formatClock(employee.breakStart)}
              </span>
            )}
            {employee.lunchStart && (
              <span className="whitespace-nowrap rounded-full bg-green-800 px-2 py-0.5 font-medium text-green-100">
                Lunch {formatClock(employee.lunchStart)}
              </span>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-3 text-sm">
        <button onClick={() => onHistory(employee)} className="text-zinc-400 hover:text-white">
          History
        </button>
        {employee.terminatedAt ? (
          <button onClick={() => onTerminate(employee, false)} className="text-green-400 hover:text-green-300">
            Reactivate
          </button>
        ) : (
          <>
            <button onClick={() => onEdit(employee)} className="text-zinc-400 hover:text-white">
              Edit
            </button>
            <button onClick={() => onTerminate(employee, true)} className="text-amber-400 hover:text-amber-300">
              Terminate
            </button>
          </>
        )}
        <button onClick={() => onDelete(employee.id)} className="text-red-400 hover:text-red-300">
          Delete
        </button>
      </div>
    </li>
  );
}

export default function EmployeesPage() {
  const guarded = useAdminGuard();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [historyFor, setHistoryFor] = useState<Employee | null>(null);
  const [history, setHistory] = useState<ActivityLog[] | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [name, setName] = useState("");
  const [positionId, setPositionId] = useState("");
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [capabilityIds, setCapabilityIds] = useState<string[]>([]);
  const [accessLevel, setAccessLevel] = useState<AccessChoice>("NONE");
  const [iAmSuper, setIAmSuper] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [shift, setShift] = useState<Shift | "">("");
  const [attendance, setAttendance] = useState<Attendance>("PRESENT");
  const [isLead, setIsLead] = useState(false);
  const [hireDate, setHireDate] = useState("");
  // Birthday is month + day only (stored as "0000-MM-DD" — the year is ignored
  // everywhere birthdays are shown).
  const [birthMonth, setBirthMonth] = useState("");
  const [birthDay, setBirthDay] = useState("");
  const [search, setSearch] = useState("");
  const [showTerminated, setShowTerminated] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async (withTerminated = showTerminated) => {
    const [employeesRes, positionsRes, rolesRes, capabilitiesRes] =
      await Promise.all([
        fetch(`/api/employees${withTerminated ? "?includeTerminated=1" : ""}`),
        fetch("/api/positions"),
        fetch("/api/equipment"),
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
    setCapabilities(await capabilitiesRes.json());
  };

  useEffect(() => {
    load();
    // Only a SuperUser may grant SuperUser, so gate that option on my own status.
    fetch("/api/me")
      .then((r) => r.json())
      .then((me) => setIAmSuper(!!me.isSuperAdmin))
      .catch(() => {});
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
    setCapabilityIds([]);
    setAccessLevel("NONE");
    setUsername("");
    setPassword("");
    setShowPassword(false);
    setShift("");
    setAttendance("PRESENT");
    setIsLead(false);
    setHireDate("");
    setBirthMonth("");
    setBirthDay("");
    setEditingId(null);
  };

  const toggleRole = (id: string) => {
    setRoleIds((current) =>
      current.includes(id)
        ? current.filter((roleId) => roleId !== id)
        : [...current, id]
    );
  };

  const toggleCapability = (id: string) => {
    setCapabilityIds((current) =>
      current.includes(id)
        ? current.filter((capId) => capId !== id)
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
        capabilityIds,
        // SuperUser is ADMIN across all locations; everything else is stored
        // as-is with isSuperAdmin off.
        accessLevel: accessLevel === "SUPERUSER" ? "ADMIN" : accessLevel,
        isSuperAdmin: accessLevel === "SUPERUSER",
        username,
        password,
        shift,
        attendance,
        isLead,
        hireDate,
        birthDate:
          birthMonth && birthDay ? `0000-${birthMonth}-${birthDay}` : "",
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
    setCapabilityIds(employee.capabilities.map((c) => c.id));
    setAccessLevel(employee.isSuperAdmin ? "SUPERUSER" : employee.accessLevel);
    setUsername(employee.username ?? "");
    setPassword("");
    setShift(employee.shift ?? "");
    setAttendance(employee.attendance ?? "PRESENT");
    setIsLead(employee.isLead ?? false);
    setHireDate(employee.hireDate ?? "");
    setBirthMonth(employee.birthDate ? employee.birthDate.slice(5, 7) : "");
    setBirthDay(employee.birthDate ? employee.birthDate.slice(8, 10) : "");
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

  const today = todayKey(new Date());

  return (
    // Full width so the shift columns spread across the screen; the import and
    // add/edit cards stay at a readable width.
    <div>
      <h2 className="mb-4 text-lg font-semibold text-white">Employees</h2>

      <div className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-white">Import from CSV</h3>
          <a
            href="/api/employees/export"
            download
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800"
          >
            Export all employees
          </a>
        </div>
        <p className="mb-3 text-sm text-zinc-400">
          Upload a CSV with columns: <code className="text-zinc-300">name</code>,{" "}
          <code className="text-zinc-300">position</code>,{" "}
          <code className="text-zinc-300">equipment</code> and{" "}
          <code className="text-zinc-300">roles</code> (separate multiple with
          semicolons), <code className="text-zinc-300">admin</code>{" "}
          (yes/no), <code className="text-zinc-300">username</code> and{" "}
          <code className="text-zinc-300">password</code> (required for admins),
          <code className="text-zinc-300">shift</code> (1, 2, or 3), and{" "}
          <code className="text-zinc-300">hire_date</code> /{" "}
          <code className="text-zinc-300">birth_date</code> (YYYY-MM-DD).
          Positions, equipment, and roles that don&apos;t exist yet are created
          automatically.{" "}
          <a
            href="/employee-import-sample.csv"
            download
            className="text-blue-400 underline hover:text-blue-300"
          >
            Download the sample CSV
          </a>
          . Export writes these same columns (minus{" "}
          <code className="text-zinc-300">password</code>, which is only stored
          hashed) plus <code className="text-zinc-300">terminated_at</code>, and
          covers current and terminated employees.
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
        className="mb-6 flex flex-col gap-4 rounded-lg border border-zinc-800 bg-zinc-900 p-4"
      >
        <h3 className="text-sm font-medium text-white">
          {editingId ? "Edit employee" : "Add employee"}
        </h3>
        {/* Two columns so the form spans the width and stays short: identity +
            assignment on the left, capabilities + panel access on the right. */}
        <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
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
          <label className="text-xs text-zinc-400">
            Hire date (optional)
            <input
              type="date"
              value={hireDate}
              onChange={(e) => setHireDate(e.target.value)}
              style={{ colorScheme: "dark" }}
              className={`mt-1 block w-full ${inputClass}`}
            />
          </label>
          <label className="text-xs text-zinc-400">
            Birthday (optional — month &amp; day)
            <div className="mt-1 grid grid-cols-2 gap-2">
              <select
                value={birthMonth}
                onChange={(e) => setBirthMonth(e.target.value)}
                className={inputClass}
              >
                <option value="">Month</option>
                {MONTHS.map((m, i) => (
                  <option key={m} value={String(i + 1).padStart(2, "0")}>
                    {m}
                  </option>
                ))}
              </select>
              <select
                value={birthDay}
                onChange={(e) => setBirthDay(e.target.value)}
                className={inputClass}
              >
                <option value="">Day</option>
                {Array.from({ length: 31 }, (_, i) => (
                  <option key={i + 1} value={String(i + 1).padStart(2, "0")}>
                    {i + 1}
                  </option>
                ))}
              </select>
            </div>
          </label>
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
        </div>

        <div className="flex flex-col gap-4">
        <div>
          <div className="mb-1 text-xs font-medium text-zinc-400">
            Equipment this employee can operate
          </div>
          {roles.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No equipment yet — add it on the Equipment page.
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

        <div>
          <div className="mb-1 text-xs font-medium text-zinc-400">
            Roles this employee can perform
          </div>
          {capabilities.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No roles yet — add them on the Roles page.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {capabilities.map((cap) => (
                <label
                  key={cap.id}
                  className={`cursor-pointer rounded-full border px-3 py-1 text-sm ${
                    capabilityIds.includes(cap.id)
                      ? "border-blue-500 bg-blue-600/20 text-blue-300"
                      : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={capabilityIds.includes(cap.id)}
                    onChange={() => toggleCapability(cap.id)}
                    className="sr-only"
                  />
                  {cap.name}
                </label>
              ))}
            </div>
          )}
        </div>

        <label className="text-xs text-zinc-400">
          Panel access
          <select
            value={accessLevel}
            onChange={(e) => setAccessLevel(e.target.value as AccessChoice)}
            className={`mt-1 block w-full ${inputClass}`}
          >
            {ACCESS_OPTIONS.filter((a) => iAmSuper || !a.superOnly).map((a) => (
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
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder={
                  editingId ? "New password (blank = keep current)" : "Password"
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required={!editingId}
                className={`${inputClass} w-full pr-14`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-pressed={showPassword}
                className="absolute inset-y-0 right-0 px-3 text-xs font-medium text-zinc-400 hover:text-zinc-200"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>
        )}
        </div>
        </div>

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
          placeholder="Search employees by name, position, or equipment…"
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

      {(() => {
        const q = search.trim().toLowerCase();
        // Within each shift column: leads first, then by position (no position
        // last), then by name. Shift is handled by splitting into columns below.
        const visible = employees
          .slice()
          .sort((a, b) => {
            if (a.isLead !== b.isLead) return a.isLead ? -1 : 1;
            const pd = positionKey(a.position).localeCompare(
              positionKey(b.position)
            );
            if (pd !== 0) return pd;
            return a.name.localeCompare(b.name);
          })
          .filter((employee) => {
            if (!q) return true;
            return (
              employee.name.toLowerCase().includes(q) ||
              (employee.position?.title ?? "").toLowerCase().includes(q) ||
              employee.roles.some((r) => r.name.toLowerCase().includes(q)) ||
              employee.capabilities.some((c) => c.name.toLowerCase().includes(q))
            );
          });

        // Workers go into the shift columns; login accounts get their own section.
        const workers = visible.filter((e) => e.accessLevel === "NONE");
        const staff = visible.filter((e) => e.accessLevel !== "NONE");

        return (
          <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {SHIFT_COLUMNS.map((col) => {
              const members = workers.filter((e) => e.shift === col.key);
              // Hide the "No shift" column when empty; keep the real shifts.
              if (col.key === null && members.length === 0) return null;
              return (
                <div
                  key={col.label}
                  className="flex flex-col rounded-lg border border-zinc-800 bg-zinc-950/50 p-3"
                >
                  <h3 className="mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    {col.label}
                    <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-zinc-400">
                      {members.length}
                    </span>
                  </h3>
                  {members.length === 0 ? (
                    <p className="text-sm text-zinc-600">No employees</p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {members.map((employee) => (
                        <EmployeeCardRow
                          key={employee.id}
                          employee={employee}
                          today={today}
                          onHistory={openHistory}
                          onEdit={handleEdit}
                          onTerminate={terminate}
                          onDelete={handleDelete}
                        />
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>

          {staff.length > 0 && (
            <div className="mt-6">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Admins &amp; Supervisors ({staff.length})
              </h3>
              <ul className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
                {staff.map((employee) => (
                  <EmployeeCardRow
                    key={employee.id}
                    employee={employee}
                    today={today}
                    onHistory={openHistory}
                    onEdit={handleEdit}
                    onTerminate={terminate}
                    onDelete={handleDelete}
                  />
                ))}
              </ul>
            </div>
          )}
          </>
        );
      })()}

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
              <>
                {(() => {
                  // Summarise: total changes + most-assigned position.
                  const counts: Record<string, number> = {};
                  for (const log of history) {
                    const m = log.action.match(/position → ([^,]+)/);
                    if (m) counts[m[1].trim()] = (counts[m[1].trim()] ?? 0) + 1;
                  }
                  const top = Object.entries(counts).sort(
                    (a, b) => b[1] - a[1]
                  )[0];
                  return (
                    <div className="mb-3 flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full bg-zinc-800 px-2 py-1 text-zinc-300">
                        {history.length} change
                        {history.length === 1 ? "" : "s"} recorded
                      </span>
                      {top && (
                        <span className="rounded-full bg-zinc-800 px-2 py-1 text-zinc-300">
                          Most assigned: {top[0]} ({top[1]}×)
                        </span>
                      )}
                    </div>
                  );
                })()}
                <ul className="flex flex-col gap-1">
                {history.map((log) => (
                  <li
                    key={log.id}
                    className="flex items-baseline justify-between gap-3 rounded-md border border-zinc-800 px-3 py-2 text-sm"
                  >
                    <span className="text-zinc-200">
                      {log.action}
                      {log.actorName && (
                        <span className="text-zinc-500"> · by {log.actorName}</span>
                      )}
                    </span>
                    <span className="whitespace-nowrap text-xs text-zinc-500">
                      {new Date(log.createdAt).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                        timeZone: APP_TZ,
                      })}
                    </span>
                  </li>
                ))}
                </ul>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
