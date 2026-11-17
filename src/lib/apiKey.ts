// API keys for the v1 machine API.
//
// A key is 32 bytes of CSPRNG output, shown once at creation and stored only
// as a SHA-256 hash. SHA-256 rather than bcrypt on purpose: there is no
// low-entropy secret to protect here, so a slow KDF would buy nothing and
// would add its cost to every single API request. What matters instead is that
// the comparison is constant-time, which it is below.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";

// Scopes. A key is confined to the surfaces it was granted, so the app that
// only posts notices cannot terminate anybody. "read" is separate from each
// write scope so a dashboard-style view can be given a key that changes
// nothing.
export const SCOPES = [
  "read",
  "employees:write",
  "attendance:write",
  "jobs:write",
  "notices:write",
] as const;
export type Scope = (typeof SCOPES)[number];

export const SCOPE_LABEL: Record<Scope, string> = {
  read: "Read everything (roster, jobs, notices)",
  "employees:write": "Add, update and terminate employees",
  "attendance:write": "Set attendance, lunches and breaks",
  "jobs:write": "Create and change jobs and side tasks",
  "notices:write": "Post and remove notices",
};

export const isScope = (v: unknown): v is Scope =>
  typeof v === "string" && (SCOPES as readonly string[]).includes(v);

export const parseScopes = (raw: unknown): Scope[] => {
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? raw.split(",")
      : [];
  return [...new Set(list.map((s) => String(s).trim()).filter(isScope))];
};

// "wd_live_" marks a dashboard key on sight, so one pasted into the wrong
// place is recognisable (and greppable in logs that should not hold it).
const PREFIX = "wd_live_";
// Enough of the key to look it up, and short enough that the remainder still
// carries the entropy. Shown in the admin list so a key is identifiable
// without being usable.
const PREFIX_LEN = PREFIX.length + 8;

export const hashKey = (key: string): string =>
  createHash("sha256").update(key, "utf8").digest("hex");

// A fresh key: the plaintext (shown once) plus what gets stored.
export function mintKey(): { key: string; prefix: string; hash: string } {
  const key = PREFIX + randomBytes(32).toString("base64url");
  return { key, prefix: key.slice(0, PREFIX_LEN), hash: hashKey(key) };
}

// Constant-time compare of two hex digests. Comparing with === would leak,
// through timing, how much of a guessed hash was right.
export function hashesMatch(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ba.length !== bb.length || ba.length === 0) return false;
  return timingSafeEqual(ba, bb);
}

// Pull the key out of a request. Accepts either `Authorization: Bearer <key>`
// or `X-API-Key: <key>`, because which one an app can send varies and neither
// is more secure than the other over HTTPS.
export function keyFromRequest(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth) {
    const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
    if (m) return m[1].trim();
  }
  const header = req.headers.get("x-api-key");
  return header?.trim() || null;
}

export type ResolvedKey = {
  id: string;
  name: string;
  locationId: string;
  scopes: Scope[];
};

// Look a presented key up. Returns null for anything wrong — unknown, revoked,
// malformed — without saying which, since an outside caller has no business
// learning the difference.
export async function resolveKey(presented: string | null): Promise<ResolvedKey | null> {
  if (!presented || !presented.startsWith(PREFIX)) return null;
  const prefix = presented.slice(0, PREFIX_LEN);
  const row = await prisma.apiKey.findUnique({ where: { prefix } });
  if (!row || row.revokedAt) return null;
  if (!hashesMatch(row.hash, hashKey(presented))) return null;
  return {
    id: row.id,
    name: row.name,
    locationId: row.locationId,
    scopes: parseScopes(row.scopes),
  };
}

// Best-effort "this key was used" stamp, for spotting a key nothing uses any
// more. Never allowed to fail a request.
export async function touchKey(id: string): Promise<void> {
  try {
    await prisma.apiKey.update({ where: { id }, data: { lastUsedAt: new Date() } });
  } catch {
    /* ignore */
  }
}
