// Helpers for tolerant spreadsheet imports: people type dates six different
// ways and misspell position titles, and neither should cost them the upload.

// ---------------------------------------------------------------- dates -----
// Every date the app stores is a "YYYY-MM-DD" string (date-only, so no
// timezone drift — see the Employee model). Excel hands us none of that: a
// real date cell arrives as a Date or a serial number, and a text cell
// arrives however the person typed it.

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

// Excel day 1 is 1900-01-01, and Excel wrongly counts 1900 as a leap year, so
// its epoch is 1899-12-30 for every date after Feb 1900 — which is all of them
// in a staff roster.
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);

const valid = (y: number, m: number, d: number) => {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};

const MONTH_NAMES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

// Two-digit years: a roster holds hire dates and birthdays, so "98" is 1998
// and "05" is 2005. Split at 30 — nobody in the system was hired in 2098.
const expandYear = (y: number) => (y >= 100 ? y : y >= 30 ? 1900 + y : 2000 + y);

export type DateStyle = "MDY" | "DMY";

// Normalize one cell to "YYYY-MM-DD", or null if it isn't a date at all.
// `style` disambiguates 03/04/2026 — see inferDateStyle().
export function normalizeDate(
  value: unknown,
  style: DateStyle = "MDY"
): string | null {
  if (value == null || value === "") return null;

  // A real Excel/JS date cell. Read UTC parts: exceljs builds these at UTC
  // midnight, and reading local parts would shift the day west of Greenwich.
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return iso(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }

  // An Excel serial number (44270 → 2021-03-15). The accepted range starts at
  // 1930-01-01 rather than at 1 for a specific reason: someone typing a bare
  // year into a date column gives us 2021, which as a serial is 1905-07-13 —
  // a plausible-looking date and completely wrong. No serial in 1900..2100
  // (i.e. any 4-digit year) survives this floor, so those are reported as
  // unparseable instead of silently corrupted. The cost is that a genuine date
  // before 1930 must be written as text, which for a staff roster is fine.
  if (typeof value === "number" && Number.isFinite(value)) {
    const EXCEL_MIN = 10959; // 1930-01-01
    const EXCEL_MAX = 73415; // 2100-12-31
    if (value < EXCEL_MIN || value > EXCEL_MAX) return null;
    const dt = new Date(EXCEL_EPOCH_MS + Math.floor(value) * 86400000);
    return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }

  const text = String(value).trim();
  if (!text) return null;

  // Already right, or ISO with a time part attached.
  const isoMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/);
  if (isoMatch) {
    const [y, m, d] = [+isoMatch[1], +isoMatch[2], +isoMatch[3]];
    return valid(y, m, d) ? iso(y, m, d) : null;
  }

  // "15-Mar-2026", "Mar 15 2026", "15 March 98"
  const named = text.match(/^(\d{1,2})[ \-/]*([A-Za-z]{3,})[ \-/]*(\d{2,4})$/);
  if (named) {
    const m = MONTH_NAMES[named[2].slice(0, 3).toLowerCase()];
    const [d, y] = [+named[1], expandYear(+named[3])];
    if (m && valid(y, m, d)) return iso(y, m, d);
  }
  const named2 = text.match(/^([A-Za-z]{3,})[ \-/]*(\d{1,2})(?:st|nd|rd|th)?,?[ \-/]*(\d{2,4})$/);
  if (named2) {
    const m = MONTH_NAMES[named2[1].slice(0, 3).toLowerCase()];
    const [d, y] = [+named2[2], expandYear(+named2[3])];
    if (m && valid(y, m, d)) return iso(y, m, d);
  }

  // Numeric with any of / - . as the separator.
  const parts = text.match(/^(\d{1,4})[/\-.](\d{1,2})[/\-.](\d{1,4})$/);
  if (parts) {
    const [a, b, c] = [+parts[1], +parts[2], +parts[3]];
    // Leading 4-digit year: 2026/03/15.
    if (parts[1].length === 4) return valid(a, b, c) ? iso(a, b, c) : null;
    const year = expandYear(c);
    // A value over 12 in either slot settles it regardless of `style`.
    if (a > 12 && valid(year, b, a)) return iso(year, b, a);
    if (b > 12 && valid(year, a, b)) return iso(year, a, b);
    const [m, d] = style === "DMY" ? [b, a] : [a, b];
    if (valid(year, m, d)) return iso(year, m, d);
    return null;
  }

  return null;
}

// Which way round an ambiguous column is written, decided by the whole column
// rather than one row: if ANY value has a first part over 12 (25/12/2026) the
// column is day-first. Mixed columns are impossible to satisfy, so US order
// wins as the default and the day-over-12 rows still parse correctly.
export function inferDateStyle(values: unknown[]): DateStyle {
  let dmy = 0;
  let mdy = 0;
  for (const v of values) {
    if (typeof v !== "string") continue;
    const parts = v.trim().match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.]\d{2,4}$/);
    if (!parts) continue;
    const [a, b] = [+parts[1], +parts[2]];
    if (a > 12 && b <= 12) dmy++;
    else if (b > 12 && a <= 12) mdy++;
  }
  return dmy > mdy ? "DMY" : "MDY";
}

// A month/day-only birthday, stored as "0000-MM-DD" (the year is meaningless —
// see the birthDate field). Accepts full dates too and drops the year.
export function normalizeBirthday(value: unknown, style: DateStyle = "MDY"): string | null {
  if (value == null || value === "") return null;
  const text = typeof value === "string" ? value.trim() : "";
  // "03/15" / "Mar 15" with no year at all.
  const bare = text.match(/^(\d{1,2})[/\-.](\d{1,2})$/);
  if (bare) {
    const [a, b] = [+bare[1], +bare[2]];
    const [m, d] = style === "DMY" || a > 12 ? [b, a] : [a, b];
    // Any leap-safe year will do for validation; birthdays include Feb 29.
    return valid(2000, m, d) ? `0000-${pad(m)}-${pad(d)}` : null;
  }
  const full = normalizeDate(value, style);
  return full ? `0000-${full.slice(5)}` : null;
}

// ------------------------------------------------------------ positions -----
// Positions are NOT created by an import: a typo would otherwise silently add
// "Fokrlift" to the board forever. Instead we match against what exists and,
// when a cell is close to a real title, offer it back for confirmation.

// Fold case, punctuation and spacing so "Fork-Lift Driver" == "forklift driver".
const fold = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

// Levenshtein distance, capped: we only care about small edit distances, and
// bailing early keeps this linear for obviously-unrelated strings.
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      best = Math.min(best, row[j]);
    }
    if (best > max) return max + 1;
    prev = row;
  }
  return prev[b.length];
}

export type PositionLike = { id: string; title: string };

// An exact match, ignoring case and punctuation. Null when there isn't one.
export function matchPosition<T extends PositionLike>(
  input: string,
  positions: T[]
): T | null {
  const key = fold(input);
  if (!key) return null;
  return positions.find((p) => fold(p.title) === key) ?? null;
}

// Titles a mistyped cell probably meant, best first. Catches transpositions and
// dropped letters ("Fokrlift", "Forklit") plus partial entry ("fork").
export function suggestPositions<T extends PositionLike>(
  input: string,
  positions: T[],
  limit = 3
): T[] {
  const key = fold(input);
  if (!key) return [];
  // Allow roughly one edit per four characters, always at least two, so short
  // titles don't match everything and long ones stay forgiving.
  const max = Math.max(2, Math.floor(key.length / 4));
  return positions
    .map((p) => {
      const t = fold(p.title);
      const distance = editDistance(key, t, max);
      // Treat a prefix/substring hit as a near-miss so "fork" finds "Forklift".
      const contains = t.includes(key) || key.includes(t);
      return { p, score: contains ? Math.min(distance, 1) : distance };
    })
    .filter((r) => r.score <= max)
    .sort((a, b) => a.score - b.score || a.p.title.localeCompare(b.p.title))
    .slice(0, limit)
    .map((r) => r.p);
}
