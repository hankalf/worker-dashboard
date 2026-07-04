import { prisma } from "@/lib/prisma";

// Records a site-wide activity entry. Never throws — logging must not break
// the mutation it accompanies.
export async function logActivity(category: string, action: string) {
  try {
    await prisma.activityLog.create({ data: { category, action } });
  } catch (error) {
    console.error("Failed to write activity log:", error);
  }
}
