"use client";

import { useEffect, useRef, useState } from "react";

type Position = { id: string; title: string };
type Role = { id: string; name: string };
type Employee = {
  id: string;
  name: string;
  isAdmin: boolean;
  email: string | null;
  positionId: string | null;
  position: Position | null;
  roles: Role[];
};

const inputClass =
  "rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500";

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [name, setName] = useState("");
  const [positionId, setPositionId] = useState("");
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const [employeesRes, positionsRes, rolesRes] = await Promise.all([
      fetch("/api/employees"),
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
  }, []);

  const resetForm = () => {
    setName("");
    setPositionId("");
    setRoleIds([]);
    setIsAdmin(false);
    setEmail("");
    setPassword("");
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
      body: JSON.stringify({ name, positionId, roleIds, isAdmin, email, password }),
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
    setIsAdmin(employee.isAdmin);
    setEmail(employee.email ?? "");
    setPassword("");
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
          <code className="text-zinc-300">email</code> and{" "}
          <code className="text-zinc-300">password</code> (required for admins).
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

        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={isAdmin}
            onChange={(e) => setIsAdmin(e.target.checked)}
            className="h-4 w-4"
          />
          Admin access (can sign in and manage everything)
        </label>

        {isAdmin && (
          <div className="grid grid-cols-2 gap-3">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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

      <ul className="flex flex-col gap-2">
        {employees.map((employee) => (
          <li
            key={employee.id}
            className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 p-3"
          >
            <div>
              <div className="flex items-center gap-2 font-medium text-white">
                {employee.name}
                {employee.isAdmin && (
                  <span className="rounded-full bg-blue-600/20 px-2 py-0.5 text-xs font-medium text-blue-300">
                    Admin
                  </span>
                )}
              </div>
              <div className="text-sm text-zinc-400">
                {employee.position?.title ?? "No position"}
                {employee.email ? ` · ${employee.email}` : ""}
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
            <div className="flex gap-3 text-sm">
              <button
                onClick={() => handleEdit(employee)}
                className="text-zinc-400 hover:text-white"
              >
                Edit
              </button>
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
    </div>
  );
}
