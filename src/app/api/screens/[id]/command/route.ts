import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";

const COMMANDS = ["refresh", "identify", "message"] as const;

// POST /api/screens/[id]/command — queue a one-shot command for a screen; it
// fires on the screen's next heartbeat. { command, arg? }
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireSuperAdmin()))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const { command, arg } = await req.json();

  if (!COMMANDS.includes(command)) {
    return NextResponse.json({ error: "Unknown command" }, { status: 400 });
  }
  if (command === "message" && (typeof arg !== "string" || !arg.trim())) {
    return NextResponse.json({ error: "A message is required" }, { status: 400 });
  }

  const screen = await prisma.screen
    .update({
      where: { id },
      data: {
        command,
        commandArg: command === "message" ? String(arg).trim() : null,
        commandAt: new Date(),
      },
    })
    .catch(() => null);
  if (!screen) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await logActivity("Fleet", `Sent "${command}" to screen "${screen.name}"`);
  return NextResponse.json({ ok: true });
}
