"use client";

import { useCallback, useEffect, useState } from "react";

type Config = {
  enabled: boolean;
  boardId: string;
  apiVersion: string;
  nameColumn: string;
  positionColumn: string;
  shiftColumn: string;
  employeeNumberColumn: string;
  misc1Column: string;
  misc2Column: string;
  terminateMissing: boolean;
  syncMinutes: number;
  hasApiToken: boolean;
  lastSyncAt: string | null;
};

type BoardColumn = { id: string; title: string; type: string };

type Diagnostic = {
  endpoint: string;
  apiVersion: string;
  boardId: string;
  status: number | string;
  errors: string[];
  boardName: string | null;
  columns: BoardColumn[];
  rowCount: number;
  sample: { itemId: string; name: string; cells: Record<string, string> }[];
  mappedPreview: {
    itemId: string;
    name: string;
    positionTitle: string | null;
    shift: string | null;
    employeeNumber: string | null;
  }[];
  unknownPositions: string[];
  plan: { create: number; update: number; terminate: number; held: string | null } | null;
};

const inputClass =
  "mt-1 block w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500";

// Each mappable field. A blank mapping means "don't sync this field".
const COLUMN_FIELDS = [
  { key: "nameColumn", label: "Name", hint: "blank = use the row's title" },
  { key: "positionColumn", label: "Position", hint: "must already exist here" },
  { key: "shiftColumn", label: "Shift", hint: "1 / 2 / 3, or 1st / 2nd / 3rd" },
  { key: "employeeNumberColumn", label: "Employee #", hint: "" },
  { key: "misc1Column", label: "Misc 1", hint: "admin-only field" },
  { key: "misc2Column", label: "Misc 2", hint: "admin-only field" },
] as const;

export function MondaySection() {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [apiToken, setApiToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [diag, setDiag] = useState<Diagnostic | null>(null);

  const load = useCallback(() => {
    fetch("/api/integrations/monday")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setCfg(d))
      .catch(() => {});
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const update = async (patch: Partial<Config> & { apiToken?: string }) => {
    if (!cfg) return;
    setCfg({ ...cfg, ...patch } as Config);
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/integrations/monday", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        setCfg(await res.json());
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
      }
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setMsg(null);
    setDiag(null);
    try {
      const res = await fetch("/api/integrations/monday/test", { method: "POST" });
      const b = await res.json();
      setMsg({ ok: !!b.ok, text: b.message ?? b.error ?? "Test failed" });
      if (b.diagnostic) setDiag(b.diagnostic);
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setTesting(false);
    }
  };

  const syncNow = async () => {
    setSyncing(true);
    setMsg(null);
    try {
      const res = await fetch("/api/integrations/monday/sync", { method: "POST" });
      const b = await res.json();
      setMsg({ ok: !!b.ok, text: b.message ?? "Sync failed" });
      load();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setSyncing(false);
    }
  };

  if (!cfg) return null;

  return (
    <div className="mt-6 max-w-xl rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-white">Monday.com board</h3>
          <p className="mt-0.5 text-xs text-zinc-400">
            Keep the employee roster in step with a Monday board. One row on the
            board is one person; the row&apos;s title is their name unless you map
            a name column.
          </p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={cfg.enabled}
            onChange={(e) => update({ enabled: e.target.checked })}
          />
          Enabled
        </label>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-zinc-400">
          Board ID
          <input
            value={cfg.boardId}
            onChange={(e) => setCfg({ ...cfg, boardId: e.target.value })}
            onBlur={(e) => update({ boardId: e.target.value })}
            placeholder="1234567890"
            className={inputClass}
          />
        </label>
        <label className="text-xs text-zinc-400">
          API token
          <input
            type="password"
            value={apiToken}
            onChange={(e) => setApiToken(e.target.value)}
            onBlur={() => {
              if (apiToken) {
                update({ apiToken });
                setApiToken("");
              }
            }}
            placeholder={cfg.hasApiToken ? "•••••••• (saved)" : "paste the token"}
            className={inputClass}
          />
        </label>
      </div>
      <p className="mt-1 text-[11px] text-zinc-500">
        Monday → avatar → Developers → My access tokens. The token is stored for
        this location and never sent back to the browser.
      </p>

      <div className="mt-4">
        <div className="mb-1 text-xs font-medium text-zinc-400">
          Column mapping — paste the column ID from Test connection below
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {COLUMN_FIELDS.map((f) => (
            <label key={f.key} className="text-xs text-zinc-400">
              {f.label}
              {f.hint && <span className="text-zinc-600"> — {f.hint}</span>}
              <input
                value={(cfg[f.key] as string) ?? ""}
                onChange={(e) => setCfg({ ...cfg, [f.key]: e.target.value } as Config)}
                onBlur={(e) => update({ [f.key]: e.target.value } as Partial<Config>)}
                placeholder="column id"
                className={inputClass}
              />
            </label>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-zinc-400">
          Sync every (minutes)
          <input
            type="number"
            min={5}
            max={1440}
            value={cfg.syncMinutes}
            onChange={(e) => setCfg({ ...cfg, syncMinutes: Number(e.target.value) })}
            onBlur={(e) => update({ syncMinutes: Number(e.target.value) })}
            className={inputClass}
          />
        </label>
        <label className="text-xs text-zinc-400">
          API version
          <input
            value={cfg.apiVersion}
            onChange={(e) => setCfg({ ...cfg, apiVersion: e.target.value })}
            onBlur={(e) => update({ apiVersion: e.target.value })}
            className={inputClass}
          />
        </label>
      </div>

      {/* The only destructive thing here, so it is off until switched on and
          says plainly what it does. */}
      <label className="mt-4 flex items-start gap-2 rounded-md border border-amber-800/50 bg-amber-950/20 p-3 text-xs text-amber-200">
        <input
          type="checkbox"
          checked={cfg.terminateMissing}
          onChange={(e) => update({ terminateMissing: e.target.checked })}
          className="mt-0.5"
        />
        <span>
          Terminate people who disappear from the board. Reversible (Reactivate on
          the Employees page), and never applied to anyone with a login or to
          anyone added here by hand. Held back automatically if the board comes
          back empty or if it would terminate more than half the synced roster.
        </span>
      </label>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={test}
          disabled={testing}
          className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
        >
          {testing ? "Testing…" : "Test connection"}
        </button>
        <button
          onClick={syncNow}
          disabled={syncing || !cfg.enabled}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {syncing ? "Syncing…" : "Sync now"}
        </button>
        {saving && <span className="text-xs text-zinc-500">Saving…</span>}
        {saved && <span className="text-xs text-green-400">Saved</span>}
        {cfg.lastSyncAt && (
          <span className="text-xs text-zinc-500">
            Last sync {new Date(cfg.lastSyncAt).toLocaleString()}
          </span>
        )}
      </div>

      {msg && (
        <p className={`mt-3 text-sm ${msg.ok ? "text-green-400" : "text-red-400"}`}>
          {msg.text}
        </p>
      )}

      {diag && (
        <div className="mt-3 space-y-3 text-xs">
          {diag.plan && (
            <p className="text-zinc-300">
              A sync now would add {diag.plan.create}, update {diag.plan.update},
              terminate {diag.plan.terminate}.
              {diag.plan.held && (
                <span className="text-amber-300"> {diag.plan.held}</span>
              )}
            </p>
          )}
          {diag.unknownPositions.length > 0 && (
            <p className="text-amber-300">
              Positions on the board that don&apos;t exist here (people sync with
              no position — add them on the Positions tab):{" "}
              {diag.unknownPositions.join(", ")}
            </p>
          )}
          {diag.columns.length > 0 && (
            <div>
              <div className="mb-1 font-medium text-zinc-400">
                Board columns — copy an ID into the mapping above
              </div>
              <ul className="divide-y divide-zinc-800 rounded border border-zinc-800">
                {diag.columns.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 px-2 py-1">
                    <span className="text-zinc-200">{c.title}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-zinc-600">{c.type}</span>
                      <code className="rounded bg-black px-1.5 py-0.5 font-mono text-zinc-400">
                        {c.id}
                      </code>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {diag.mappedPreview.length > 0 && (
            <div>
              <div className="mb-1 font-medium text-zinc-400">
                How the first rows map
              </div>
              <ul className="divide-y divide-zinc-800 rounded border border-zinc-800">
                {diag.mappedPreview.map((p) => (
                  <li key={p.itemId} className="px-2 py-1 text-zinc-300">
                    {p.name}
                    <span className="text-zinc-600">
                      {p.positionTitle ? ` · ${p.positionTitle}` : ""}
                      {p.shift ? ` · ${p.shift}` : ""}
                      {p.employeeNumber ? ` · #${p.employeeNumber}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <textarea
            readOnly
            value={JSON.stringify(diag, null, 2)}
            onFocus={(e) => e.currentTarget.select()}
            className="h-48 w-full resize-y rounded border border-zinc-800 bg-black px-2 py-1.5 font-mono text-[11px] leading-relaxed text-zinc-300"
          />
        </div>
      )}
    </div>
  );
}
