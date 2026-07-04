import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/rbac";

const RETENTION_DAYS = 14;

export async function GET() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Purge anything older than the retention window on read (no cron needed).
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.activityLog.deleteMany({ where: { createdAt: { lt: cutoff } } });

  const logs = await prisma.activityLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 2000,
  });
  return NextResponse.json(logs);
}
