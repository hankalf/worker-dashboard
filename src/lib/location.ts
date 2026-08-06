// Multi-location helpers for the app UI.
//
// The active-location resolution and the Prisma scoping extension live in
// src/lib/prisma.ts (the extension needs them internally, so keeping them there
// avoids a circular import). This module re-exports the request-facing pieces
// and adds the lookups the admin panel / public board use.
import { prisma, getActiveLocationId, ACTIVE_LOCATION_COOKIE } from "@/lib/prisma";

export { getActiveLocationId, ACTIVE_LOCATION_COOKIE };

// A session-scoped marker (no maxAge, so it clears when the browser session
// ends) that records whether a super-admin has explicitly picked a dashboard to
// work in during this session. When unset, the Admin Dashboard tab shows the
// "Master Dashboard" — the list of locations to choose from — before showing
// any one location's board. Separate from ACTIVE_LOCATION_COOKIE, which is the
// persistent tenant scope every other tab relies on.
export const DASHBOARD_SELECTED_COOKIE = "wd_dashboard_selected";

export type Location = {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
};

// Every location, oldest first — the first one is the default (what the board
// falls back to when no location is explicitly selected).
export function listLocations() {
  return prisma.location.findMany({ orderBy: { createdAt: "asc" } });
}

// The active location record for the current request, or null if none exists
// yet (a brand-new install before the seed has run).
export async function getActiveLocation(): Promise<Location | null> {
  const id = await getActiveLocationId();
  return id ? prisma.location.findUnique({ where: { id } }) : null;
}

// Resolve a location by its slug (used by the public board's ?loc= selector and
// fleet screens). Returns null for an unknown slug.
export function getLocationBySlug(slug: string): Promise<Location | null> {
  return prisma.location.findUnique({ where: { slug } });
}

// URL-safe slug from a free-text name ("Shipping Dock #2" -> "shipping-dock-2").
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// Create a location, deriving a unique slug from its name (or an explicit slug),
// appending -2, -3, … on collision. Returns the created location.
export async function createLocation(
  name: string,
  desiredSlug?: string
): Promise<Location> {
  const base = slugify(desiredSlug || name) || "location";
  let slug = base;
  for (let n = 2; await prisma.location.findUnique({ where: { slug } }); n++) {
    slug = `${base}-${n}`;
  }
  return prisma.location.create({ data: { name: name.trim(), slug } });
}
