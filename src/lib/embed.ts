// Embedding the dashboard inside another site — a Monday board view, say.
//
// Two separate things have to be true for that to work, and getting one without
// the other is what makes it look broken:
//
//   1. The other site has to be allowed to frame us at all, which is the CSP
//      `frame-ancestors` directive (see next.config.ts). Without it the iframe
//      renders blank or refuses to load.
//
//   2. Our cookies have to survive being third-party. Inside an iframe the
//      browser treats a cookie for this site as cross-site, and the default
//      `SameSite=Lax` means it is simply not sent — so the login POST succeeds,
//      the session cookie comes back, and the very next request arrives with no
//      session. That reads as "I can't log in" even though nothing is wrong
//      with the password. The fix is `SameSite=None; Secure; Partitioned`.
//
// `Partitioned` (CHIPS) is what keeps this from being a blanket third-party
// cookie: the cookie is stored against the embedding site, so the session
// created inside Monday is only ever sent back inside Monday. Chrome is phasing
// out unpartitioned third-party cookies, so the alternative is a session that
// stops working at some point rather than one that works now.
//
// The practical consequence of partitioning, worth knowing before it surprises
// someone: a login at the dashboard's own URL and a login inside the Monday
// view are two separate cookie jars. Signing in on one does not sign you in on
// the other. That is inherent to CHIPS, not something this code chooses.

// Monday serves app views from *.monday.app nested inside *.monday.com, so both
// have to be listed — frame-ancestors is checked against every frame in the
// chain, not just the top one.
const DEFAULT_FRAME_ANCESTORS = "https://*.monday.com https://*.monday.app";

// A CSP host-source: scheme://host, where the leftmost label may be a wildcard
// and a port is allowed. Deliberately strict — a malformed source does not fail
// loudly in CSP, the browser just drops the whole directive, which would
// silently re-break framing.
const HOST_SOURCE = /^https?:\/\/(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)*(:\d+)?$/i;

const isValidSource = (s: string) => s === "'self'" || HOST_SOURCE.test(s);

// Who may frame the dashboard, from EMBED_FRAME_ANCESTORS (space- or
// comma-separated). Unset falls back to the Monday hosts. Set it to "none" to
// forbid embedding entirely, which also returns the cookies to SameSite=Lax.
export function frameAncestors(): string[] {
  const raw = process.env.EMBED_FRAME_ANCESTORS ?? DEFAULT_FRAME_ANCESTORS;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.toLowerCase() === "none") return [];
  return trimmed
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter(isValidSource);
}

// The full CSP value, or null when embedding is off (send no header at all
// rather than an empty directive). 'self' is always included so the dashboard
// can still frame its own pages.
export function frameAncestorsCsp(): string | null {
  const sources = frameAncestors();
  if (sources.length === 0) return null;
  const withSelf = sources.includes("'self'") ? sources : ["'self'", ...sources];
  return `frame-ancestors ${withSelf.join(" ")}`;
}

// Should cookies be sent cross-site?
//
// Only when embedding is allowed AND we are in production. `SameSite=None` is
// invalid without `Secure`, and `Secure` cookies are dropped over plain HTTP —
// so switching this on in local development would break signing in at
// localhost instead of fixing anything. Testing the embed locally therefore
// needs HTTPS (a tunnel), not a code change.
export function crossSiteCookies(): boolean {
  return frameAncestors().length > 0 && process.env.NODE_ENV === "production";
}

// Cookie attributes for anything that has to survive being framed. Spread over
// a cookie's own options; returns nothing when embedding is off, so the normal
// SameSite=Lax behaviour is left exactly as it was.
export function crossSiteCookieOptions(): {
  sameSite?: "none";
  secure?: true;
  partitioned?: true;
} {
  return crossSiteCookies()
    ? { sameSite: "none", secure: true, partitioned: true }
    : {};
}
