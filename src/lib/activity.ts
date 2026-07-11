import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

// The display name of the current session's user (best-effort, may be null).
export async function getActorName(): Promise<string | null> {
  try {
    const session = await auth();
    if (!session?.user?.id) return null;
    const actor = await prisma.employee.findUnique({
      where: { id: session.user.id },
      select: { name: true },
    });
    return actor?.name ?? session.user.name ?? null;
  } catch {
    return null;
  }
}

// Records a site-wide activity entry, stamping who made the change (from the
// current session). `subjectId` optionally links the entry to an employee for
// per-person history. Never throws — logging must not break the mutation.
export async function logActivity(
  category: string,
  action: string,
  subjectId?: string | null
) {
  let actorId: string | null = null;
  let actorName: string | null = null;
  try {
    const session = await auth();
    if (session?.user?.id) {
      actorId = session.user.id;
      const actor = await prisma.employee.findUnique({
        where: { id: actorId },
        select: { name: true },
      });
      actorName = actor?.name ?? session.user.name ?? null;
    }
  } catch {
    // ignore — actor is best-effort
  }

  try {
    await prisma.activityLog.create({
      data: { category, action, subjectId: subjectId ?? null, actorId, actorName },
    });
  } catch (error) {
    console.error("Failed to write activity log:", error);
  }
}
