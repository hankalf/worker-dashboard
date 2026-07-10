"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Branding = {
  logo: string;
  headerBg: string;
  headerFg: string;
  notice: string;
  handoff: string;
  badge: string;
};

const EMPTY: Branding = {
  logo: "",
  headerBg: "",
  headerFg: "",
  notice: "",
  handoff: "",
  badge: "",
};

// Representative swatch shown in the color picker when a color is unset.
const SWATCH: Record<keyof Branding, string> = {
  logo: "",
  headerBg: "#0b0b0c",
  headerFg: "#ffffff",
  notice: "#3b82f6",
  handoff: "#8b5cf6",
  badge: "#14b8a6",
};

const COLOR_FIELDS: { key: keyof Branding; label: string; hint: string }[] = [
  { key: "headerBg", label: "Header background", hint: "Top bar on every page" },
  { key: "headerFg", label: "Header text", hint: "Dashboard name + links" },
  { key: "notice", label: "Notices", hint: "Notice banners" },
  { key: "handoff", label: "Shift handoff", hint: "Handoff banner" },
  { key: "badge", label: "Badges", hint: "Lead + shift chips" },
];

// Shrink an uploaded image to a small square-ish logo (keeps transparency).
async function fileToLogo(file: File): Promise<string> {
  const dataUrl: string = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataUrl;
  });
  const max = 256;
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/png");
}

// Branding editor (logo + accent colors), shown on the General settings tab.
// Changes are saved immediately; a router.refresh picks up the new server-
// rendered theme so the whole panel recolors live.
export function AppearanceEditor() {
  const router = useRouter();
  const [b, setB] = useState<Branding>(EMPTY);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        if (d.branding) setB({ ...EMPTY, ...d.branding });
      })
      .catch(() => {});
  }, []);

  const save = async (patch: Partial<Branding>) => {
    setError(null);
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ branding: patch }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not save.");
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    router.refresh();
  };

  const setColor = (key: keyof Branding, value: string) => {
    setB((s) => ({ ...s, [key]: value }));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save({ [key]: value }), 300);
  };

  const onLogo = async (file: File | undefined) => {
    if (!file) return;
    try {
      const logo = await fileToLogo(file);
      setB((s) => ({ ...s, logo }));
      await save({ logo });
    } catch {
      setError("Could not read that image.");
    }
  };

  return (
    <div className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-white">Appearance</h3>
        {saved && <span className="text-sm text-green-400">Saved</span>}
      </div>
      <p className="mt-1 text-sm text-zinc-400">
        Upload a logo and set accent colors for the header, notices, shift
        handoff, and badges. Cleared colors fall back to the default.
      </p>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}

      {/* Logo */}
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <div className="flex h-16 w-32 items-center justify-center rounded-md border border-dashed border-zinc-700 bg-zinc-950">
          {b.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={b.logo} alt="Logo" className="max-h-14 max-w-[7rem] object-contain" />
          ) : (
            <span className="text-xs text-zinc-600">No logo</span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <label className="inline-block cursor-pointer rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500">
            {b.logo ? "Replace logo" : "Upload logo"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => onLogo(e.target.files?.[0])}
            />
          </label>
          {b.logo && (
            <button
              onClick={() => {
                setB((s) => ({ ...s, logo: "" }));
                save({ logo: "" });
              }}
              className="text-xs text-zinc-400 hover:text-red-300"
            >
              Remove logo
            </button>
          )}
          <span className="text-xs text-zinc-500">
            Shown left of the name. Auto-shrunk; PNG/SVG with transparency works
            best.
          </span>
        </div>
      </div>

      {/* Colors */}
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {COLOR_FIELDS.map(({ key, label, hint }) => (
          <div
            key={key}
            className="flex items-center gap-3 rounded-md border border-zinc-800 bg-zinc-950/50 px-3 py-2"
          >
            <input
              type="color"
              value={(b[key] as string) || SWATCH[key]}
              onChange={(e) => setColor(key, e.target.value)}
              className="h-8 w-10 shrink-0 cursor-pointer rounded border border-zinc-700 bg-transparent"
              aria-label={label}
            />
            <div className="min-w-0 flex-1">
              <div className="text-sm text-zinc-200">{label}</div>
              <div className="truncate text-xs text-zinc-500">{hint}</div>
            </div>
            {b[key] ? (
              <button
                onClick={() => setColor(key, "")}
                className="shrink-0 text-xs text-zinc-400 hover:text-zinc-200"
              >
                Default
              </button>
            ) : (
              <span className="shrink-0 text-xs text-zinc-600">Default</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
