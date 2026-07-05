// The warehouse operates on US Eastern time. Using the IANA zone (rather than a
// fixed UTC offset) keeps EST/EDT daylight-saving correct automatically.
export const APP_TZ = "America/New_York";

// Minutes since midnight in the app timezone for a given instant — used for the
// current-shift and on-lunch calculations so they don't depend on the viewer's
// own timezone.
export function appMinutes(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return h * 60 + m;
}

// The Eastern calendar day for an instant, as "YYYY-MM-DD" (en-CA formats that
// way). Used to key daily headcount snapshots to the warehouse's day.
export function easternDateKey(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

// Current Eastern wall-clock time as "YYYY-MM-DDTHH:mm" for prefilling a
// <input type="datetime-local">.
export function easternDateTimeInput(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(now);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
}

// Offset (ms) of the app timezone at a given instant: appTZ wall clock − UTC.
function easternOffsetMs(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  const asUTC = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second")
  );
  return asUTC - at.getTime();
}

// Interpret a datetime-local value ("YYYY-MM-DDTHH:mm") as Eastern wall time and
// return the matching UTC instant as an ISO string — so a notice's expiry means
// the same moment regardless of the admin's own browser timezone. (Accurate
// except within the one-hour DST transition, which is fine for expiries.)
export function easternInputToUtcISO(input: string): string {
  const [datePart, timePart] = input.split("T");
  const [y, mo, d] = datePart.split("-").map(Number);
  const [h, mi] = (timePart ?? "0:0").split(":").map(Number);
  const utcGuess = Date.UTC(y, mo - 1, d, h, mi);
  const offset = easternOffsetMs(new Date(utcGuess));
  return new Date(utcGuess - offset).toISOString();
}
