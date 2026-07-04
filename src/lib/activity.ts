import { prisma } from "@/lib/prisma";

// Records a site-wide activity entry. `subjectId` optionally links the entry to
// an employee for per-person history. Never throws — logging must not break the
// mutation it accompanies.
export async function logActivity(
  category: string,
  action: string,
  subjectId?: string | null
) {
  try {
    await prisma.activityLog.create({
      data: { category, action, subjectId: subjectId ?? null },
    });
  } catch (error) {
    console.error("Failed to write activity log:", error);
  }
}
