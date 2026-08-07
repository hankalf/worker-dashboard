"use client";

import { useEffect, useRef, useState } from "react";
import { useAdminGuard } from "@/lib/useAdminGuard";
import { AppearanceEditor } from "@/components/AppearanceEditor";

// Auto-scroll speed slider (1–10) for the main dashboard's scrolling sections.
// Saves automatically shortly after the slider stops moving.
function ScrollSpeed() {
  const [speed, setSpeed] = useState(4);
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        if (d.scrollSpeed) setSpeed(d.scrollSpeed);
      })
      .catch(() => {});
  }, []);

  const onChange = (value: number) => {
    setSpeed(value);
    setSaved(false);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scrollSpeed: value }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
      }
    }, 400);
  };

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <h3 className="text-sm font-medium text-white">Auto-scroll speed</h3>
      <p className="mt-1 text-sm text-zinc-400">
        How fast the main dashboard&apos;s overflowing sections (positions,
        lunch, side tasks) scroll. Saves automatically.
      </p>
      <div className="mt-3 flex items-center gap-3">
        <span className="text-xs text-zinc-500">Slow</span>
        <input
          type="range"
          min={1}
          max={10}
          step={1}
          value={speed}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-2 w-full max-w-xs cursor-pointer accent-blue-500"
        />
        <span className="text-xs text-zinc-500">Fast</span>
        <span className="w-8 text-sm tabular-nums text-zinc-300">{speed}</span>
        {saved && <span className="text-sm text-green-400">Saved</span>}
      </div>
    </div>
  );
}

// Shift time frames (start of each shift). Each shift ends where the next
// begins; the 3rd wraps past midnight to the 1st's start. Drives currentShift
// and the shift ranges shown across the whole dashboard.
function ShiftTimes() {
  const [first, setFirst] = useState("06:00");
  const [second, setSecond] = useState("14:00");
  const [third, setThird] = useState("22:00");
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const minToHHMM = (min: number) =>
    `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        if (d.shiftBounds) {
          setFirst(minToHHMM(d.shiftBounds.firstStart));
          setSecond(minToHHMM(d.shiftBounds.secondStart));
          setThird(minToHHMM(d.shiftBounds.thirdStart));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // "06:00" -> "6:00 AM" for the range preview.
  const to12 = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    if (Number.isNaN(h)) return hhmm;
    const h12 = ((h + 11) % 12) + 1;
    return `${h12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
  };

  const save = async () => {
    setError(null);
    setSaved(false);
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shift: { firstStart: first, secondStart: second, thirdStart: third },
      }),
    });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Could not save shift times.");
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const rows: { label: string; value: string; set: (v: string) => void; end: string }[] = [
    { label: "1st shift", value: first, set: setFirst, end: second },
    { label: "2nd shift", value: second, set: setSecond, end: third },
    { label: "3rd shift", value: third, set: setThird, end: first },
  ];

  return (
    <div>
      <h3 className="text-sm font-medium text-white">Shift times</h3>
      <p className="mb-3 mt-1 text-sm text-zinc-400">
        Set when each shift starts. Each shift ends when the next begins (the 3rd
        wraps past midnight to the 1st). Times increase: 1st &lt; 2nd &lt; 3rd.
        Reflected across the whole dashboard.
      </p>
      <div className="flex flex-col gap-3">
        {rows.map((r) => (
          <label key={r.label} className="flex flex-wrap items-center gap-3 text-sm text-zinc-300">
            <span className="w-20 shrink-0">{r.label} starts</span>
            <input
              type="time"
              value={r.value}
              onChange={(e) => {
                r.set(e.target.value);
                setSaved(false);
              }}
              disabled={loading}
              style={{ colorScheme: "dark" }}
              className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-100"
            />
            <span className="text-xs text-zinc-500">
              {to12(r.value)} – {to12(r.end)}
            </span>
          </label>
        ))}
      </div>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={save}
          disabled={loading}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
        >
          Save shift times
        </button>
        {saved && <span className="text-sm text-green-400">Saved</span>}
      </div>
    </div>
  );
}

type DescItem = {
  id: string;
  name?: string;
  title?: string;
  description: string | null;
};

// Inline editor for the descriptions of a set of items (positions, roles, or
// equipment). Saves each description on its own via the item's PATCH endpoint.
function DescriptionList({
  heading,
  listUrl,
  itemUrl,
}: {
  heading: string;
  listUrl: string;
  itemUrl: (id: string) => string;
}) {
  const [items, setItems] = useState<DescItem[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savedId, setSavedId] = useState<string | null>(null);

  useEffect(() => {
    fetch(listUrl)
      .then((r) => r.json())
      .then((data: DescItem[]) => {
        if (!Array.isArray(data)) return;
        setItems(data);
        setDrafts(
          Object.fromEntries(data.map((i) => [i.id, i.description ?? ""]))
        );
      })
      .catch(() => {});
  }, [listUrl]);

  const save = async (id: string) => {
    const res = await fetch(itemUrl(id), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: drafts[id] }),
    });
    if (res.ok) {
      setSavedId(id);
      setTimeout(() => setSavedId((s) => (s === id ? null : s)), 1500);
    }
  };

  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
        {heading}
      </h4>
      {items.length === 0 ? (
        <p className="text-sm text-zinc-500">Nothing here yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-2">
              <span className="w-40 shrink-0 truncate text-sm text-zinc-300">
                {item.title ?? item.name}
              </span>
              <input
                value={drafts[item.id] ?? ""}
                onChange={(e) =>
                  setDrafts((d) => ({ ...d, [item.id]: e.target.value }))
                }
                placeholder="Description"
                className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-500"
              />
              <button
                onClick={() => save(item.id)}
                className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
              >
                Save
              </button>
              {savedId === item.id && (
                <span className="text-xs text-green-400">Saved</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type TabRow = { key: string; label: string; description: string; group: string };

// Edit the admin nav tab names + descriptions (stored as overrides).
function TabEditor() {
  const [tabs, setTabs] = useState<TabRow[]>([]);
  const [drafts, setDrafts] = useState<
    Record<string, { name: string; desc: string }>
  >({});
  const [savedKey, setSavedKey] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/tabs")
      .then((r) => r.json())
      .then((data: TabRow[]) => {
        if (!Array.isArray(data)) return;
        setTabs(data);
        setDrafts(
          Object.fromEntries(
            data.map((t) => [t.key, { name: t.label, desc: t.description || "" }])
          )
        );
      })
      .catch(() => {});
  }, []);

  const save = async (key: string) => {
    const d = drafts[key];
    const res = await fetch("/api/tabs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, name: d.name, description: d.desc }),
    });
    if (res.ok) {
      setSavedKey(key);
      setTimeout(() => setSavedKey((k) => (k === key ? null : k)), 1500);
    }
  };

  return (
    <div>
      <h3 className="text-sm font-medium text-white">Tab names</h3>
      <p className="mb-3 mt-1 text-sm text-zinc-400">
        Rename the admin tabs and give them a hover description. Clear the name
        to revert to the default; reload to see the nav update.
      </p>
      <ul className="flex flex-col gap-2">
        {tabs.map((t) => (
          <li key={t.key} className="flex flex-wrap items-center gap-2">
            <input
              value={drafts[t.key]?.name ?? ""}
              onChange={(e) =>
                setDrafts((d) => ({
                  ...d,
                  [t.key]: { ...d[t.key], name: e.target.value },
                }))
              }
              className="w-36 shrink-0 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100"
            />
            <input
              value={drafts[t.key]?.desc ?? ""}
              onChange={(e) =>
                setDrafts((d) => ({
                  ...d,
                  [t.key]: { ...d[t.key], desc: e.target.value },
                }))
              }
              placeholder="Description (tooltip)"
              className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-500"
            />
            <button
              onClick={() => save(t.key)}
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              Save
            </button>
            {savedKey === t.key && (
              <span className="text-xs text-green-400">Saved</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Danger zone: bulk-clear datasets (irreversible, type-to-confirm).
function ClearData() {
  const OPTIONS = [
    { key: "employees", label: "Employees (keeps login accounts)" },
    { key: "positions", label: "Positions" },
    { key: "roles", label: "Roles" },
    { key: "equipment", label: "Equipment" },
    { key: "activity", label: "Activity & history logs" },
  ];
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    const targets = OPTIONS.filter((o) => sel[o.key]).map((o) => o.key);
    if (targets.length === 0) {
      setResult("Select at least one dataset.");
      return;
    }
    const typed = window.prompt(
      `This permanently deletes: ${targets.join(", ")}.\nType DELETE to confirm.`
    );
    if (typed !== "DELETE") return;
    setBusy(true);
    setResult(null);
    const res = await fetch("/api/admin/clear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targets }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setResult(body.error ?? "Failed.");
      return;
    }
    setResult(
      "Cleared — " +
        Object.entries(body.cleared as Record<string, number>)
          .map(([k, v]) => `${v} ${k}`)
          .join(", ")
    );
    setSel({});
  };

  return (
    <div>
      <h3 className="text-sm font-medium text-red-400">Danger zone — clear data</h3>
      <p className="mb-2 mt-1 text-sm text-zinc-400">
        Permanently deletes the selected data. This cannot be undone — download a
        backup first.
      </p>
      <div className="flex flex-col gap-1.5">
        {OPTIONS.map((o) => (
          <label key={o.key} className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={!!sel[o.key]}
              onChange={() => setSel((s) => ({ ...s, [o.key]: !s[o.key] }))}
              className="h-4 w-4"
            />
            {o.label}
          </label>
        ))}
      </div>
      <button
        onClick={run}
        disabled={busy}
        className="mt-3 rounded-md border border-red-800 bg-red-950/40 px-4 py-2 text-sm font-medium text-red-300 hover:bg-red-950/70 disabled:opacity-50"
      >
        {busy ? "Clearing…" : "Clear selected data"}
      </button>
      {result && <p className="mt-2 text-sm text-amber-300">{result}</p>}
    </div>
  );
}

// Rotating-dashboard config: external URL, interval, enable + a live preview.
function RotatingDashboard() {
  const [url, setUrl] = useState("");
  const [seconds, setSeconds] = useState(30);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        setUrl(d.rotatingUrl ?? "");
        setSeconds(d.rotationSeconds ?? 30);
        setEnabled(!!d.rotatingEnabled);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rotatingUrl: url,
        rotationSeconds: seconds,
        rotatingEnabled: enabled,
      }),
    });
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }
  };

  return (
    <div>
      <h3 className="text-sm font-medium text-white">Rotating dashboard</h3>
      <p className="mb-3 mt-1 text-sm text-zinc-400">
        Alternate the main dashboard between its normal view and an external page
        (the header with the date/time stays put). Some sites block being
        embedded — use Preview to check.
      </p>
      <div className="flex flex-col gap-3">
        <label className="text-sm text-zinc-300">
          URL
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/schedule"
            disabled={loading}
            className="mt-1 block w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500"
          />
        </label>
        <label className="text-sm text-zinc-300">
          Seconds between rotations
          <input
            type="number"
            min={5}
            max={3600}
            value={seconds}
            onChange={(e) => setSeconds(Number(e.target.value))}
            className="mt-1 block w-32 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-4 w-4"
          />
          Enable rotating display on the dashboard
        </label>

        <div className="flex items-center gap-3">
          <button
            onClick={save}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
          >
            Save
          </button>
          <button
            onClick={() => setPreview((p) => !p)}
            disabled={!url}
            className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
          >
            {preview ? "Hide preview" : "Preview"}
          </button>
          {saved && <span className="text-sm text-green-400">Saved</span>}
        </div>
        {preview && url && (
          <iframe
            src={url}
            title="Rotating display preview"
            className="mt-1 h-72 w-full rounded-md border border-zinc-700 bg-white"
          />
        )}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const guarded = useAdminGuard();
  const [dashboardName, setDashboardName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => setDashboardName(data.dashboardName ?? ""))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setSaving(true);
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dashboardName }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Something went wrong");
      return;
    }
    const data = await res.json();
    setDashboardName(data.dashboardName);
    setSaved(true);
    // Reflect the new name in this browser's tab title immediately.
    document.title = data.dashboardName;
  };

  if (!guarded) {
    return <p className="text-sm text-zinc-500">Checking access…</p>;
  }

  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold text-white">General</h2>
      <p className="mb-4 text-sm text-zinc-400">
        These apply to the location selected in the header — each warehouse has
        its own name, branding, scroll speed, and shift times.
      </p>

      {/* Simple settings cards flow into as many columns as the window allows. */}
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-4"
      >
        <label className="text-sm font-medium text-zinc-300">
          Dashboard name
          <input
            value={dashboardName}
            onChange={(e) => {
              setDashboardName(e.target.value);
              setSaved(false);
            }}
            disabled={loading}
            placeholder="Warehouse Dashboard"
            required
            className="mt-1 block w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500"
          />
        </label>
        <p className="text-xs text-zinc-500">
          Shown on the main dashboard header, the browser tab, the login page,
          and the admin panel.
        </p>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving || loading}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          {saved && <span className="text-sm text-green-400">Saved</span>}
        </div>
      </form>

      <ScrollSpeed />
      </div>

      <AppearanceEditor />

      <details className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
        <summary className="cursor-pointer text-sm font-medium text-white">
          Advanced
        </summary>
        <div className="mt-5 flex flex-col gap-8">
          <div>
            <h3 className="text-sm font-medium text-white">Backup</h3>
            <p className="mt-1 text-sm text-zinc-400">
              Download a full Excel workbook (one sheet each for employees,
              positions, roles, equipment, side tasks, notices, history, and
              settings). Passwords are not included.
            </p>
            <a
              href="/api/backup"
              className="mt-3 inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
            >
              Download full backup (.xlsx)
            </a>
          </div>

          <ShiftTimes />

          <RotatingDashboard />

          <TabEditor />

          <div>
            <h3 className="text-sm font-medium text-white">Descriptions</h3>
            <p className="mb-4 mt-1 text-sm text-zinc-400">
              Edit the descriptions for positions (shown on the dashboard),
              roles, and equipment.
            </p>
            <div className="flex flex-col gap-6">
              <DescriptionList
                heading="Positions"
                listUrl="/api/positions"
                itemUrl={(id) => `/api/positions/${id}`}
              />
              <DescriptionList
                heading="Roles"
                listUrl="/api/roles"
                itemUrl={(id) => `/api/roles/${id}`}
              />
              <DescriptionList
                heading="Equipment"
                listUrl="/api/equipment"
                itemUrl={(id) => `/api/equipment/${id}`}
              />
            </div>
          </div>

          <ClearData />
        </div>
      </details>
    </div>
  );
}
