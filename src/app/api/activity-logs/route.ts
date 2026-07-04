import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/rbac";

const RETENTION_DAYS = 14;

export async function GET(req: Request) {
  const staff = await requireStaff();
  if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Purge anything older than the retention window on read (no cron needed),
  // but keep archived entries (e.g. terminated-employee history) forever.
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.activityLog.deleteMany({
    where: { createdAt: { lt: cutoff }, archived: false },
  });

  // Optional per-employee history via ?subjectId=
  const subjectId = new URL(req.url).searchParams.get("subjectId");

  const logs = await prisma.activityLog.findMany({
    where: subjectId ? { subjectId } : undefined,
    orderBy: { createdAt: "desc" },
    take: 2000,
  });
  return NextResponse.json(logs);
}
