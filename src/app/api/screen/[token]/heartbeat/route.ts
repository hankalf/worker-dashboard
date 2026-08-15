import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// How recent a pushed command must be to still fire — avoids a command issued
// while a screen was offline surprising it minutes later.
const COMMAND_TTL_MS = 2 * 60 * 1000;

// POST /api/screen/[token]/heartbeat — called by a live screen every ~15s.
// Marks the screen seen (drives Fleet online status) and returns any pending
// command, clearing it so it fires exactly once. Public; the token is the auth.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const screen = await prisma.screen.findUnique({ where: { token } });
  if (!screen) return NextResponse.json({ error: "Unknown screen" }, { status: 404 });

  const fresh =
    screen.command &&
    screen.commandAt &&
    Date.now() - screen.commandAt.getTime() < COMMAND_TTL_MS;

  await prisma.screen.update({
    where: { id: screen.id },
    data: {
      lastSeenAt: new Date(),
      // Clear the command whether it fired or was stale.
      command: null,
      commandArg: null,
      commandAt: null,
    },
  });

  // theme rides along on every beat, so a Fleet toggle reaches the screen
  // within one poll and a rebooted screen re-syncs immediately.
  return NextResponse.json(
    fresh
      ? { command: screen.command, commandArg: screen.commandArg, theme: screen.theme }
      : { command: null, theme: screen.theme }
  );
}
