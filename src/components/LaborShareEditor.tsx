"use client";

import { useEffect, useState } from "react";

type Position = { id: string; title: string };
type LaborShare = {
  id: string;
  name: string;
  shift: string;
  positionId: string | null;
  positionTitle: string | null;
  comingInAt: string | null;
  leavingAt: string | null;
  comingIn: string;
  leaving: string;
};

const SHIFTS = [
  { value: "FIRST", label: "1st Shift" },
  { value: "SECOND", label: "2nd Shift" },
  { value: "THIRD", label: "3rd Shift" },
];
const SHIFT_LABEL: Record<string, string> = {
  FIRST: "1st",
  SECOND: "2nd",
  THIRD: "3rd",
};

// Add temporary "labor share" workers borrowed for a shift. They never join the
// Employees list — they show on the board for their shift and auto-delete once
// the shift ends. Lives on the Assign tab.
export function LaborShareEditor() {
  const [list, setList] = useState<LaborShare[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [name, setName] = useState("");
  const [shift, setShift] = useState("FIRST");
  const [positionId, setPositionId] = useState("");
  const [comingIn, setComingIn] = useState("");
  const [leaving, setLeaving] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/labor-share")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => Array.isArray(d) && setList(d))
      .catch(() => {});
    fetch("/api/positions")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => Array.isArray(d) && setPositions(d))
      .catch(() => {});
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setPositionId("");
    setComingIn("");
    setLeaving("");
  };

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/labor-share", {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editingId ?? undefined,
        name,
        shift,
        positionId: positionId || null,
        comingIn: comingIn || null,
        leaving: leaving || null,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Could not save.");
      return;
    }
    setList(await res.json());
    resetForm();
  };

  const startEdit = (l: LaborShare) => {
    setEditingId(l.id);
    setName(l.name);
    setShift(l.shift);
    setPositionId(l.positionId ?? "");
    setComingIn(l.comingIn);
    setLeaving(l.leaving);
    setError(null);
  };

  const remove = async (id: string) => {
    const res = await fetch(`/api/labor-share?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      setList(await res.json());
      if (editingId === id) resetForm();
    }
  };

  const inputClass =
    "rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500";

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400">
        Labor share
      </label>
      <p className="mb-3 text-xs text-zinc-500">
        Borrowed workers for a shift — they show on the board for that shift and
        auto-remove when it ends. Not added to the Employees list.
      </p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          placeholder="Name"
          className={inputClass}
        />
        <select
          value={shift}
          onChange={(e) => setShift(e.target.value)}
          style={{ colorScheme: "dark" }}
          className={inputClass}
        >
          {SHIFTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          value={positionId}
          onChange={(e) => setPositionId(e.target.value)}
          style={{ colorScheme: "dark" }}
          className={inputClass}
        >
          <option value="">No position</option>
          {positions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-xs text-zinc-400">
          In
          <input
            type="time"
            value={comingIn}
            onChange={(e) => setComingIn(e.target.value)}
            style={{ colorScheme: "dark" }}
            className={`flex-1 ${inputClass}`}
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-zinc-400">
          Out
          <input
            type="time"
            value={leaving}
            onChange={(e) => setLeaving(e.target.value)}
            style={{ colorScheme: "dark" }}
            className={`flex-1 ${inputClass}`}
          />
        </label>
        <div className="flex gap-2">
          <button
            onClick={save}
            disabled={busy || !name.trim()}
            className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {busy ? "Saving…" : editingId ? "Save" : "Add"}
          </button>
          {editingId && (
            <button
              onClick={resetForm}
              className="rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}

      {list.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2">
          {list.map((l) => (
            <li
              key={l.id}
              className="flex items-center justify-between gap-3 rounded-md border border-zinc-800 bg-zinc-950/50 px-3 py-2 text-sm"
            >
              <span className="min-w-0">
                <span className="font-medium text-zinc-100">{l.name}</span>
                <span className="ml-2 text-xs text-zinc-500">
                  {SHIFT_LABEL[l.shift]} · {l.positionTitle ?? "No position"}
                  {l.comingInAt || l.leavingAt
                    ? ` · ${l.comingInAt ?? "?"}${l.leavingAt ? `–${l.leavingAt}` : ""}`
                    : ""}
                </span>
              </span>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => startEdit(l)}
                  className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:border-blue-700 hover:bg-blue-950/30 hover:text-blue-300"
                >
                  Edit
                </button>
                <button
                  onClick={() => remove(l.id)}
                  className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:border-red-800 hover:bg-red-950/40 hover:text-red-300"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
