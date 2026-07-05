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
