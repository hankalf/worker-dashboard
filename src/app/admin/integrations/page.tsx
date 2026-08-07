"use client";

import { useEffect, useState } from "react";
import { useAdminGuard } from "@/lib/useAdminGuard";

type Config = {
  enabled: boolean;
  baseUrl: string;
  email: string;
  warehouseId: string;
  windowHours: number;
  personRoles: string;
  aliases: string;
  hasPassword: boolean;
};

type Probe = {
  label: string;
  url: string;
  status: number | string;
  ok: boolean;
  count: number | null;
  body: string;
};

type Diagnostic = {
  loginUrl: string;
  loginStatus: number | string;
  loginBody: string;
  tokenFound: boolean;
  tokenClaims: Record<string, unknown> | null;
  probes: Probe[];
  bestUrl: string | null;
  count: number | null;
  sample: unknown | null;
  pipeline: {
    docksInWarehouse: number;
    appointmentsInWindow: number;
    doorTags: string[];
    unmatchedTags: string[];
    ignoredTags: number;
    employees: number;
    matchedEmployees: string[];
    windowHours: number;
    appointmentsTotal: number;
    taggedOutsideWindow: string[];
  } | null;
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
  const [diag, setDiag] = useState<Diagnostic | null>(null);
  const [copied, setCopied] = useState(false);
  // Board rotation for the dock schedule. Stored with the other display
  // settings (/api/settings), but surfaced here so everything Opendock lives
  // in one place.
  const [rotate, setRotate] = useState(false);
  const [hiddenTones, setHiddenTones] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/integrations/opendock")
      .then((r) => r.json())
      .then(setCfg)
      .catch(() => {});
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        setRotate(!!d.rotatingDock);
        setHiddenTones(
          String(d.rotatingDockHidden ?? "other,requested")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        );
      })
      .catch(() => {});
  }, []);

  const toggleTone = (tone: string) =>
    setHiddenTones((prev) =>
      prev.includes(tone) ? prev.filter((t) => t !== tone) : [...prev, tone]
    );

  const saveRotation = () =>
    fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rotatingDock: rotate,
        rotatingDockHidden: hiddenTones.join(","),
      }),
    });

  const update = (patch: Partial<Config>) =>
    setCfg((c) => (c ? { ...c, ...patch } : c));

  const save = async () => {
    if (!cfg) return;
    setSaving(true);
    setSaved(false);
    const [res] = await Promise.all([
      fetch("/api/integrations/opendock", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...cfg, password: password || undefined }),
      }),
      saveRotation(),
    ]);
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
    setDiag(null);
    setCopied(false);
    // Save first so the test uses the current field values.
    await fetch("/api/integrations/opendock", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...cfg, password: password || undefined }),
    });
    const res = await fetch("/api/integrations/opendock/test", { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setTesting(false);
    setTestMsg({ ok: !!body.ok, text: body.message ?? body.error ?? "Failed" });
    setDiag(body.diagnostic ?? null);
  };

  const diagText = diag ? JSON.stringify(diag, null, 2) : "";
  const copyDiag = async () => {
    try {
      await navigator.clipboard.writeText(diagText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be blocked — the box is selectable as a fallback */
    }
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
          <label className="text-xs text-zinc-400">
            Time window (hours either side of now)
            <input
              type="number"
              min={1}
              max={168}
              className={inputClass}
              value={cfg.windowHours}
              onChange={(e) => update({ windowHours: Number(e.target.value) })}
            />
            <span className="mt-1 block text-[11px] text-zinc-500">
              Only appointments starting within this many hours show on badges.
              Raise it if crews tag loads well ahead of the shift.
            </span>
          </label>
          <label className="text-xs text-zinc-400">
            Person tag roles
            <input
              className={inputClass}
              placeholder="receiver, loader"
              value={cfg.personRoles}
              onChange={(e) => update({ personRoles: e.target.value })}
            />
            <span className="mt-1 block text-[11px] text-zinc-500">
              Only tags with these prefixes name a person — e.g.{" "}
              <span className="text-zinc-300">RECEIVER: DENNIS R.</span> Every
              other tag is ignored.
            </span>
          </label>
          <label className="text-xs text-zinc-400">
            Name overrides
            <textarea
              rows={4}
              className={`${inputClass} font-mono`}
              placeholder={"JB = Jose Barrera\nJOSUE = Josue Aguilar Madrigal"}
              value={cfg.aliases}
              onChange={(e) => update({ aliases: e.target.value })}
            />
            <span className="mt-1 block text-[11px] text-zinc-500">
              One per line, <span className="text-zinc-300">TAG = Employee</span>
              . Use for nicknames, initials, and first names two people share.
            </span>
          </label>
        </div>

        <div className="mt-4 rounded-md border border-zinc-800 bg-zinc-950 p-3">
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={rotate}
              onChange={(e) => setRotate(e.target.checked)}
            />
            Rotate the main dashboard through today&apos;s dock schedule
          </label>
          <p className="mt-1 text-xs text-zinc-500">
            Adds a dock schedule panel to the board&apos;s rotation — scheduled
            and arrival times, status, door, PO #, load type, direction and dwell
            times. Rotation interval is set on the General tab.
          </p>
          {rotate && (
            <div className="mt-3">
              <div className="mb-1 text-xs text-zinc-400">Hide these statuses</div>
              <div className="flex flex-wrap gap-3">
                {[
                  ["active", "In progress"],
                  ["arrived", "Arrived"],
                  ["scheduled", "Scheduled"],
                  ["requested", "Requested"],
                  ["done", "Completed"],
                  ["other", "Cancelled / other"],
                ].map(([tone, label]) => (
                  <label
                    key={tone}
                    className="flex items-center gap-1.5 text-xs text-zinc-300"
                  >
                    <input
                      type="checkbox"
                      checked={hiddenTones.includes(tone)}
                      onChange={() => toggleTone(tone)}
                      className="h-3.5 w-3.5"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          )}
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

        {diag && (
          <div className="mt-4 rounded-md border border-zinc-800 bg-zinc-950 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs text-zinc-400">
                Connection details. If the badge statuses aren&apos;t showing yet,
                copy this and paste it back so the field mapping can be finalized.
              </p>
              <button
                onClick={copyDiag}
                className="shrink-0 rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <dl className="mb-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-zinc-500">Login</dt>
              <dd className="text-zinc-300">
                {String(diag.loginStatus)} · token {diag.tokenFound ? "found ✓" : "missing ✗"}
              </dd>
              {diag.tokenClaims?.role !== undefined && (
                <>
                  <dt className="text-zinc-500">Account role</dt>
                  <dd className="text-zinc-300">{String(diag.tokenClaims.role)}</dd>
                </>
              )}
            </dl>

            {diag.pipeline && (
              <div className="mb-3 rounded border border-zinc-800 bg-zinc-900 p-2 text-xs">
                <div className="mb-1 font-medium text-zinc-300">Badge sync</div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                  <dt className="text-zinc-500">Docks in warehouse</dt>
                  <dd className="text-zinc-300">{diag.pipeline.docksInWarehouse}</dd>
                  <dt className="text-zinc-500">Appointments</dt>
                  <dd className="text-zinc-300">
                    {diag.pipeline.appointmentsInWindow} in window (±
                    {diag.pipeline.windowHours}h) of {diag.pipeline.appointmentsTotal}{" "}
                    total
                  </dd>
                  <dt className="text-zinc-500">Matched</dt>
                  <dd
                    className={
                      diag.pipeline.matchedEmployees.length
                        ? "text-green-400"
                        : "text-amber-400"
                    }
                  >
                    {diag.pipeline.matchedEmployees.length ? (
                      <ul className="flex flex-col gap-0.5">
                        {diag.pipeline.matchedEmployees.map((m) => (
                          <li key={m}>{m}</li>
                        ))}
                      </ul>
                    ) : (
                      "none"
                    )}
                  </dd>
                  <dt className="text-zinc-500">Unmatched</dt>
                  <dd
                    className={
                      diag.pipeline.unmatchedTags.length
                        ? "text-amber-400"
                        : "text-zinc-300"
                    }
                  >
                    {diag.pipeline.unmatchedTags.length ? (
                      <ul className="flex flex-col gap-0.5">
                        {diag.pipeline.unmatchedTags.map((m) => (
                          <li key={m}>{m}</li>
                        ))}
                      </ul>
                    ) : (
                      "none"
                    )}
                  </dd>
                  <dt className="text-zinc-500">Door tags</dt>
                  <dd className="text-zinc-300">
                    {diag.pipeline.doorTags.length
                      ? diag.pipeline.doorTags.join(", ")
                      : "none found"}
                  </dd>
                  <dt className="text-zinc-500">Reference tags</dt>
                  <dd className="text-zinc-300">
                    {diag.pipeline.ignoredTags} skipped (PID / ASN / PO numbers)
                  </dd>
                  {diag.pipeline.taggedOutsideWindow.length > 0 && (
                    <>
                      <dt className="text-zinc-500">Outside window</dt>
                      <dd className="text-amber-400">
                        {diag.pipeline.taggedOutsideWindow.join(" · ")}
                      </dd>
                    </>
                  )}
                </dl>
                {diag.pipeline.taggedOutsideWindow.length > 0 && (
                  <p className="mb-2 text-amber-400">
                    These name tags are on appointments outside the ±
                    {diag.pipeline.windowHours}h window, so they don&apos;t reach
                    the badges. Raise the time window above to include them.
                  </p>
                )}
                {diag.pipeline.unmatchedTags.length > 0 && (
                  <p className="mt-2 text-amber-400">
                    &ldquo;nobody on the roster&rdquo; means no employee has that
                    name — check the spelling in Opendock or the Employees tab.
                    &ldquo;ambiguous&rdquo; means several people fit, so it
                    won&apos;t guess; add the last initial (or full surname) to
                    the Opendock tag.
                  </p>
                )}
              </div>
            )}

            {diag.probes.length > 0 && (
              <ul className="mb-2 flex flex-col gap-1">
                {diag.probes.map((p) => (
                  <li
                    key={p.url}
                    className="flex items-baseline justify-between gap-2 text-xs"
                  >
                    <span className="min-w-0 truncate text-zinc-400">{p.label}</span>
                    <span
                      className={`shrink-0 font-mono ${
                        p.ok ? "text-green-400" : "text-red-400"
                      }`}
                    >
                      {String(p.status)}
                      {p.count ? ` · ${p.count} rows` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <textarea
              readOnly
              value={diagText}
              onFocus={(e) => e.currentTarget.select()}
              className="h-64 w-full resize-y rounded border border-zinc-800 bg-black px-2 py-1.5 font-mono text-[11px] leading-relaxed text-zinc-300"
            />
          </div>
        )}
      </div>
    </div>
  );
}
