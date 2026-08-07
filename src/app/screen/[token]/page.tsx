import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma, runWithLocation } from "@/lib/prisma";
import { DashboardView } from "@/components/DashboardView";
import { ScreenController } from "@/components/ScreenController";
import { fetchBoardProps } from "@/lib/boardData";
import { getBranding } from "@/lib/settings";

export const dynamic = "force-dynamic";

// Looked up by both generateMetadata and the page; cache() keeps that to one
// query per request.
const getScreen = cache(async (token: string) =>
  prisma.screen.findUnique({ where: { token }, include: { location: true } })
);

// The root layout titles every page from the *active* location (the admin's
// cookie, or the default), which is wrong here: a wall display is pinned to its
// own location and has no cookie. Without this the tab showed the default
// dashboard's name while the board itself showed the assigned one.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const screen = await getScreen(token);
  if (!screen) return {};

  // Match the board header, which titles a screen by its location.
  const name = screen.location.name;
  const branding = await runWithLocation(screen.locationId, getBranding);
  return {
    title: name,
    description: `${name} dashboard`,
    icons: branding.logo ? { icon: branding.logo } : undefined,
  };
}

// Public per-screen board. Point a wall display at /screen/<token> and it shows
// that screen's assigned location, read-only. The token is the access control;
// the board is pinned to the screen's location regardless of any cookie.
export default async function ScreenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const screen = await getScreen(token);
  if (!screen) notFound();

  const props = await runWithLocation(screen.locationId, fetchBoardProps);
  return (
    <>
      <ScreenController token={screen.token} name={screen.name} />
      <DashboardView {...props} title={screen.location.name} isAdmin={false} />
    </>
  );
}
