import { prisma, getActiveLocationId } from "@/lib/prisma";
import { DEFAULT_SHIFT_BOUNDS, type ShiftBounds } from "@/lib/shift";

// Editable display settings, stored per-location in the LocationSetting table
// (keyed by the active location) so each warehouse's board has its own name,
// branding, scroll speed, rotation, and shift bounds.

// Read several per-location settings at once → { key: value }.
async function readSettings(keys: string[]): Promise<Record<string, string>> {
  const locationId = await getActiveLocationId();
  if (!locationId) return {};
  const rows = await prisma.locationSetting.findMany({
    where: { locationId, key: { in: keys } },
  });
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

// Read one per-location setting, or null if unset.
async function readSetting(key: string): Promise<string | null> {
  const locationId = await getActiveLocationId();
  if (!locationId) return null;
  const row = await prisma.locationSetting.findUnique({
    where: { locationId_key: { locationId, key } },
  });
  return row?.value ?? null;
}

// Parse "HH:MM" (24h) to minute-of-day, or null if malformed.
export function parseHhmm(v: string | undefined | null): number | null {
  if (!v) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

const SHIFT_KEYS = ["shiftFirstStart", "shiftSecondStart", "shiftThirdStart"] as const;

// The configured shift boundaries, or the defaults if unset/invalid. The three
// starts must be strictly increasing (first < second < third) to partition the
// day cleanly; otherwise we fall back to the defaults.
export async function getShiftBounds(): Promise<ShiftBounds> {
  try {
    const m = await readSettings([...SHIFT_KEYS]);
    const f = parseHhmm(m.shiftFirstStart);
    const s = parseHhmm(m.shiftSecondStart);
    const t = parseHhmm(m.shiftThirdStart);
    if (f !== null && s !== null && t !== null && f < s && s < t) {
      return { firstStart: f, secondStart: s, thirdStart: t };
    }
    return DEFAULT_SHIFT_BOUNDS;
  } catch {
    return DEFAULT_SHIFT_BOUNDS;
  }
}

export const DEFAULT_DASHBOARD_NAME = "Warehouse Dashboard";
const DASHBOARD_NAME_KEY = "dashboardName";

// The dashboard name shown across the public board, login page, browser tab,
// and admin panel. Falls back to the default if unset or if the table isn't
// there yet (e.g. before the migration runs) so the dashboard never crashes.
export async function getDashboardName(): Promise<string> {
  try {
    const v = await readSetting(DASHBOARD_NAME_KEY);
    return v?.trim() || DEFAULT_DASHBOARD_NAME;
  } catch {
    return DEFAULT_DASHBOARD_NAME;
  }
}

export async function setDashboardName(name: string): Promise<string> {
  const value = name.trim() || DEFAULT_DASHBOARD_NAME;
  await setSetting(DASHBOARD_NAME_KEY, value);
  return value;
}

// Generic per-location key/value setter (writes to the active location).
export async function setSetting(key: string, value: string): Promise<void> {
  const locationId = await getActiveLocationId();
  if (!locationId) return;
  await prisma.locationSetting.upsert({
    where: { locationId_key: { locationId, key } },
    update: { value },
    create: { locationId, key, value },
  });
}

// Auto-scroll speed for the main dashboard's overflowing sections, as a 1–10
// slider value (default 4 ≈ the original 24px/s pace).
export async function getScrollSpeed(): Promise<number> {
  try {
    const n = Number(await readSetting("scrollSpeed"));
    return n >= 1 && n <= 10 ? Math.round(n) : 4;
  } catch {
    return 4;
  }
}

// Text size on the main dashboard, as a percentage. Applied like browser zoom
// so everything scales together and the layout reflows (rather than clipping),
// which is how a wall display gets readable from further away.
export const FONT_SCALE_MIN = 75;
export const FONT_SCALE_MAX = 200;
export const FONT_SCALE_DEFAULT = 100;

export function clampFontScale(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return FONT_SCALE_DEFAULT;
  return Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, n));
}

export async function getBoardFontScale(): Promise<number> {
  try {
    const raw = await readSetting("boardFontScale");
    return raw ? clampFontScale(raw) : FONT_SCALE_DEFAULT;
  } catch {
    return FONT_SCALE_DEFAULT;
  }
}

// Branding / theme: an optional logo (stored as a data URL so it survives
// redeploys on hosts with an ephemeral filesystem) and a handful of accent
// colors. Empty string = "unset", so the default styling is used.
export type Branding = {
  logo: string;
  headerBg: string;
  headerFg: string;
  notice: string;
  handoff: string;
  badge: string;
};

const isHexColor = (v: unknown): v is string =>
  typeof v === "string" && /^#[0-9a-fA-F]{3,8}$/.test(v);

export async function getBranding(): Promise<Branding> {
  const empty: Branding = {
    logo: "",
    headerBg: "",
    headerFg: "",
    notice: "",
    handoff: "",
    badge: "",
  };
  try {
    const m = await readSettings([
      "brand.logo",
      "brand.headerBg",
      "brand.headerFg",
      "brand.notice",
      "brand.handoff",
      "brand.badge",
    ]);
    const color = (v: unknown) => (isHexColor(v) ? v : "");
    const logo =
      typeof m["brand.logo"] === "string" &&
      m["brand.logo"].startsWith("data:image/")
        ? m["brand.logo"]
        : "";
    return {
      logo,
      headerBg: color(m["brand.headerBg"]),
      headerFg: color(m["brand.headerFg"]),
      notice: color(m["brand.notice"]),
      handoff: color(m["brand.handoff"]),
      badge: color(m["brand.badge"]),
    };
  } catch {
    return empty;
  }
}

// Rotating-dashboard config: the public board can rotate between its own
// content and an external URL (shown in an iframe) on a timer.
export type RotationConfig = {
  url: string;
  seconds: number;
  enabled: boolean;
  // Rotate the board with the Opendock dock schedule as well. Independent of
  // the external URL — either, both, or neither can be on.
  dock: boolean;
  // Statuses the dock panel hides by default, as tone keys ("other,requested").
  dockHidden: string;
};

const DEFAULT_DOCK_HIDDEN = "other,requested";

export async function getRotationConfig(): Promise<RotationConfig> {
  try {
    const m = await readSettings([
      "rotatingUrl",
      "rotationSeconds",
      "rotatingEnabled",
      "rotatingDock",
      "rotatingDockHidden",
    ]);
    return {
      url: m.rotatingUrl ?? "",
      seconds: Number(m.rotationSeconds) || 30,
      enabled: m.rotatingEnabled === "true",
      dock: m.rotatingDock === "true",
      dockHidden: m.rotatingDockHidden ?? DEFAULT_DOCK_HIDDEN,
    };
  } catch {
    return {
      url: "",
      seconds: 30,
      enabled: false,
      dock: false,
      dockHidden: DEFAULT_DOCK_HIDDEN,
    };
  }
}
