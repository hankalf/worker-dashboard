import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { buildLogCsv } from "@/lib/logReport";

export const dynamic = "force-dynamic";

// Admin: download ALL log data (activity + side-task logs) as one CSV. Does not
// delete anything — the client clears the DB (DELETE /api/activity-logs) only
// after this download succeeds.
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { csv } = await buildLogCsv(new Date());
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="warehouse-logs-${stamp}.csv"`,
    },
  });
}
