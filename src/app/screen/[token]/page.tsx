import { notFound } from "next/navigation";
import { prisma, runWithLocation } from "@/lib/prisma";
import { DashboardView } from "@/components/DashboardView";
import { ScreenController } from "@/components/ScreenController";
import { fetchBoardProps } from "@/lib/boardData";

export const dynamic = "force-dynamic";

// Public per-screen board. Point a wall display at /screen/<token> and it shows
// that screen's assigned location, read-only. The token is the access control;
// the board is pinned to the screen's location regardless of any cookie.
export default async function ScreenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const screen = await prisma.screen.findUnique({
    where: { token },
    include: { location: true },
  });
  if (!screen) notFound();

  const props = await runWithLocation(screen.locationId, fetchBoardProps);
  return (
    <>
      <ScreenController token={screen.token} name={screen.name} />
      <DashboardView {...props} title={screen.location.name} isAdmin={false} />
    </>
  );
}
