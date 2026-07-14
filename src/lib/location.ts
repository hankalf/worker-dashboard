// Multi-location helpers for the app UI.
//
// The active-location resolution and the Prisma scoping extension live in
// src/lib/prisma.ts (the extension needs them internally, so keeping them there
// avoids a circular import). This module re-exports the request-facing pieces
// and adds the lookups the admin panel / public board use.
import { prisma, getActiveLocationId, ACTIVE_LOCATION_COOKIE } from "@/lib/prisma";

export { getActiveLocationId, ACTIVE_LOCATION_COOKIE };

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
