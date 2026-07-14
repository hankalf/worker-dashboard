import { NextResponse } from "next/server";
import { prisma, getActiveLocationId } from "@/lib/prisma";
import { requireStaff } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";

const SHIFTS = ["FIRST", "SECOND", "THIRD"];
const SHIFT_LABEL: Record<string, string> = {
  FIRST: "1st",
  SECOND: "2nd",
  THIRD: "3rd",
};

// Public read — the dashboards show the active shift's handoff note. The client
// keys notes by shift, so expose the shift value as `id` (its historical shape).
export async function GET() {
  const notes = await prisma.shiftNote.findMany();
  return NextResponse.json(
    notes.map((n) => ({
      id: n.shift,
      message: n.message,
      updatedByName: n.updatedByName,
      updatedAt: n.updatedAt,
    }))
  );
}

// Admin/supervisor sets (or clears) one shift's handoff note.
export async function PUT(req: Request) {
  const staff = await requireStaff();
  if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { shift, message } = await req.json();
  if (!SHIFTS.includes(shift)) {
    return NextResponse.json({ error: "Invalid shift" }, { status: 400 });
  }
  const trimmed = typeof message === "string" ? message.trim() : "";

  const author =
    (
      await prisma.employee.findUnique({
        where: { id: staff.session.user!.id },
        select: { name: true },
      })
    )?.name ?? null;

  if (!trimmed) {
    await prisma.shiftNote.deleteMany({ where: { shift } });
    await logActivity("Shift note", `Cleared ${SHIFT_LABEL[shift]} shift handoff note`);
    return NextResponse.json(null);
  }

  const locationId = await getActiveLocationId();
  if (!locationId) {
    return NextResponse.json({ error: "No active location" }, { status: 500 });
  }
  const note = await prisma.shiftNote.upsert({
    where: { locationId_shift: { locationId, shift } },
    update: { message: trimmed, updatedByName: author },
    create: { shift, message: trimmed, updatedByName: author },
  });
  await logActivity("Shift note", `Updated ${SHIFT_LABEL[shift]} shift handoff note`);
  return NextResponse.json({ id: note.shift, message: note.message });
}
