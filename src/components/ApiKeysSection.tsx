"use client";

import { useCallback, useEffect, useState } from "react";

type Key = {
  id: string;
  name: string;
  prefix: string;
  scopes: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

const SCOPE_LABEL: Record<string, string> = {
  read: "Read everything (roster, jobs, notices)",
  "employees:write": "Add, update and terminate employees",
  "attendance:write": "Set attendance, lunches and breaks",
  "jobs:write": "Create and change jobs and side tasks",
  "notices:write": "Post and remove notices",
};

const inputClass =
  "mt-1 block w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500";

// API keys let an outside app drive this location without a human session.
export function ApiKeysSection() {
  const [keys, setKeys] = useState<Key[] | null>(null);
  const [allScopes, setAllScopes] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["read"]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Shown once, right after minting. There is no way to see it again.
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    fetch("/api/admin/api-keys")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setKeys(d.keys);
        setAllScopes(d.allScopes ?? []);
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    setCreating(true);
    setError(null);
    setFreshKey(null);
    try {
      const res = await fetch("/api/admin/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, scopes }),
      });
      const b = await res.json();
      if (!res.ok) {
        setError(b.error ?? "Could not create the key");
        return;
      }
      setFreshKey(b.key);
      setName("");
      load();
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (k: Key) => {
    if (!confirm(`Revoke "${k.name}"? Anything using it stops working immediately.`)) return;
    await fetch(`/api/admin/api-keys/${k.id}`, { method: "DELETE" });
    load();
  };

  const toggle = (s: string) =>
    setScopes((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  if (!keys) return null;

  return (
    <div className="mt-6 max-w-xl rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <h3 className="font-medium text-white">API keys</h3>
      <p className="mt-0.5 text-xs text-zinc-400">
        Let an outside app — a central-ops tool, an automation — read and change
        this location over HTTP. Each key is tied to the location selected in the
        header and to the scopes you give it.
      </p>

      {freshKey && (
        <div className="mt-3 rounded-md border border-green-800/60 bg-green-950/30 p-3">
          <p className="text-xs font-medium text-green-200">
            Copy this now — it is not shown again.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto rounded bg-black px-2 py-1.5 font-mono text-[11px] text-green-300">
              {freshKey}
            </code>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(freshKey);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="shrink-0 rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="mt-2 text-[11px] text-green-300/80">
            Send it as <code>Authorization: Bearer …</code> or{" "}
            <code>X-API-Key: …</code>. Check it with{" "}
            <code>GET /api/v1/ping</code>.
          </p>
        </div>
      )}

      <div className="mt-4 grid gap-3">
        <label className="text-xs text-zinc-400">
          What is this key for?
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Central ops app"
            className={inputClass}
          />
        </label>
        <div>
          <div className="text-xs text-zinc-400">What may it do?</div>
          <div className="mt-1 flex flex-col gap-1">
            {allScopes.map((s) => (
              <label key={s} className="flex items-center gap-2 text-xs text-zinc-300">
                <input
                  type="checkbox"
                  checked={scopes.includes(s)}
                  onChange={() => toggle(s)}
                />
                <code className="text-zinc-400">{s}</code>
                <span className="text-zinc-500">— {SCOPE_LABEL[s] ?? ""}</span>
              </label>
            ))}
          </div>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div>
          <button
            onClick={create}
            disabled={creating || !name.trim() || scopes.length === 0}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {creating ? "Creating…" : "Create key"}
          </button>
        </div>
      </div>

      {keys.length > 0 && (
        <ul className="mt-4 divide-y divide-zinc-800 rounded border border-zinc-800">
          {keys.map((k) => (
            <li key={k.id} className="flex items-start justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-100">
                  {k.name}
                  {k.revokedAt && (
                    <span className="rounded-full bg-zinc-700 px-2 py-0.5 text-[11px] text-zinc-300">
                      Revoked
                    </span>
                  )}
                </div>
                <div className="mt-0.5 font-mono text-[11px] text-zinc-500">
                  {k.prefix}…
                </div>
                <div className="mt-0.5 text-[11px] text-zinc-500">
                  {k.scopes.split(",").join(" · ")}
                </div>
                <div className="mt-0.5 text-[11px] text-zinc-600">
                  {k.lastUsedAt
                    ? `Last used ${new Date(k.lastUsedAt).toLocaleString()}`
                    : "Never used"}
                </div>
              </div>
              {!k.revokedAt && (
                <button
                  onClick={() => revoke(k)}
                  className="shrink-0 text-xs text-red-400 hover:text-red-300"
                >
                  Revoke
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
