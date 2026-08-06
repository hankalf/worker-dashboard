"use client";

import { useEffect, useState } from "react";
import { useAdminGuard } from "@/lib/useAdminGuard";

type Config = {
  enabled: boolean;
  baseUrl: string;
  email: string;
  warehouseId: string;
  hasPassword: boolean;
};

const inputClass =
  "mt-1 block w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500";

export default function IntegrationsPage() {
  const guarded = useAdminGuard();
  const [cfg, setCfg] = useState<Config | null>(null);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/integrations/opendock")
      .then((r) => r.json())
      .then(setCfg)
      .catch(() => {});
  }, []);

  const update = (patch: Partial<Config>) =>
    setCfg((c) => (c ? { ...c, ...patch } : c));

  const save = async () => {
    if (!cfg) return;
    setSaving(true);
    setSaved(false);
    const res = await fetch("/api/integrations/opendock", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...cfg, password: password || undefined }),
    });
    setSaving(false);
    if (res.ok) {
      setCfg(await res.json());
      setPassword("");
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }
  };

  const test = async () => {
    setTesting(true);
    setTestMsg(null);
    // Save first so the test uses the current field values.
    await fetch("/api/integrations/opendock", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...cfg, password: password || undefined }),
    });
    const res = await fetch("/api/integrations/opendock/test", { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setTesting(false);
    setTestMsg({ ok: res.ok, text: body.message ?? body.error ?? "Failed" });
  };

  if (!guarded) return <p className="text-sm text-zinc-500">Checking access…</p>;
  if (!cfg) return <p className="text-sm text-zinc-500">Loading…</p>;

  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold text-white">Integrations</h2>
      <p className="mb-4 max-w-2xl text-sm text-zinc-400">
        Connect outside systems for the location selected in the header.
      </p>

      <div className="max-w-xl rounded-lg border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium text-white">Opendock</h3>
            <p className="mt-0.5 text-xs text-zinc-400">
              Pull dock-appointment status onto employee badges. Matched by the
              Opendock appointment <span className="text-zinc-300">tag</span> that
              carries the employee&apos;s name.
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

        <div className="mt-4 flex flex-col gap-3">
          <label className="text-xs text-zinc-400">
            API base URL
            <input
              className={inputClass}
              placeholder="https://…"
              value={cfg.baseUrl}
              onChange={(e) => update({ baseUrl: e.target.value })}
            />
          </label>
          <label className="text-xs text-zinc-400">
            Login email
            <input
              className={inputClass}
              placeholder="you@company.com"
              value={cfg.email}
              onChange={(e) => update({ email: e.target.value })}
            />
          </label>
          <label className="text-xs text-zinc-400">
            Password
            <input
              type="password"
              className={inputClass}
              placeholder={cfg.hasPassword ? "•••••••• (leave blank to keep)" : "Opendock password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label className="text-xs text-zinc-400">
            Warehouse ID
            <input
              className={inputClass}
              placeholder="Opendock warehouse / facility ID"
              value={cfg.warehouseId}
              onChange={(e) => update({ warehouseId: e.target.value })}
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={save}
            disabled={saving}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            onClick={test}
            disabled={testing}
            className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
          >
            {testing ? "Testing…" : "Test connection"}
          </button>
          {saved && <span className="text-sm text-green-400">Saved</span>}
          {testMsg && (
            <span className={`text-sm ${testMsg.ok ? "text-green-400" : "text-red-400"}`}>
              {testMsg.text}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
