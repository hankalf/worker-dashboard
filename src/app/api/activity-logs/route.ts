import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/rbac";
import { deleteLogs } from "@/lib/logReport";
import { logActivity } from "@/lib/activity";

const RETENTION_DAYS = 14;

export async function GET(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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

// Admin: clear all log data (activity + side-task logs), keeping archived
// (terminated-employee) history. Used by the manual "Export & clear" action
// after the CSV has been downloaded.
export async function DELETE() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const deleted = await deleteLogs(new Date());
  // Leaves a single audit marker that the logs were cleared.
  await logActivity("Logs", `Exported and cleared ${deleted} log entries`);
  return NextResponse.json({ ok: true, deleted });
}
