import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { APP_TZ } from "@/lib/time";

export const dynamic = "force-dynamic";

const csvCell = (v: string) =>
  /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;

function toCsv(header: string[], rows: string[][]) {
  return [header.join(","), ...rows.map((r) => r.map(csvCell).join(","))].join(
    "\r\n"
  );
}

// UTF-8 with a BOM (so Excel reads it correctly), base64-encoded for Resend.
const toBase64 = (csv: string) =>
  Buffer.from("﻿" + csv, "utf8").toString("base64");

// Shared secret in the query (?token=) or an Authorization: Bearer header.
function authorized(req: Request): boolean {
  const secret = process.env.REPORT_TOKEN;
  if (!secret) return false;
  const qToken = new URL(req.url).searchParams.get("token");
  const auth = req.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  return qToken === secret || bearer === secret;
}

async function runReport() {
  // Snapshot the cutoff so logs written during the run aren't deleted un-exported.
  const now = new Date();

  const [activity, tasks] = await Promise.all([
    // Exclude archived (terminated-employee history) — those are kept in the DB.
    prisma.activityLog.findMany({
      where: { createdAt: { lte: now }, archived: false },
      orderBy: { createdAt: "asc" },
    }),
    prisma.taskLog.findMany({
      where: { createdAt: { lte: now } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  if (activity.length === 0 && tasks.length === 0) {
    return { emailed: false, message: "No logs to export.", deleted: 0 };
  }

  const fmt = (d: Date) => ({
    date: d.toLocaleDateString(undefined, { timeZone: APP_TZ }),
    time: d.toLocaleTimeString(undefined, { timeZone: APP_TZ }),
  });

  const activityCsv = toCsv(
    ["Date", "Time", "Category", "Change", "By"],
    activity.map((l) => {
      const f = fmt(l.createdAt);
      return [f.date, f.time, l.category, l.action, l.actorName ?? ""];
    })
  );
  const taskCsv = toCsv(
    ["Date", "Time", "Task", "Action"],
    tasks.map((l) => {
      const f = fmt(l.createdAt);
      return [f.date, f.time, l.jobTitle, l.action];
    })
  );

  const stamp = now.toISOString().slice(0, 10);
  const to = process.env.REPORT_TO!;

  // Email first — only delete once we know it was archived to the inbox.
  await sendEmail({
    to,
    subject: `Warehouse log export — ${stamp}`,
    text:
      `Full log export as of ${now.toLocaleString(undefined, { timeZone: APP_TZ })} (Eastern).\n\n` +
      `Activity log entries: ${activity.length}\n` +
      `Side-task log entries: ${tasks.length}\n\n` +
      `These rows are cleared from the database after this email. ` +
      `Terminated-employee history is retained and not included.`,
    attachments: [
      { filename: `activity-log-${stamp}.csv`, content: toBase64(activityCsv) },
      { filename: `side-task-log-${stamp}.csv`, content: toBase64(taskCsv) },
    ],
  });

  const [delActivity, delTasks] = await Promise.all([
    prisma.activityLog.deleteMany({
      where: { createdAt: { lte: now }, archived: false },
    }),
    prisma.taskLog.deleteMany({ where: { createdAt: { lte: now } } }),
  ]);

  return {
    emailed: true,
    activityExported: activity.length,
    taskExported: tasks.length,
    deleted: delActivity.count + delTasks.count,
  };
}

async function handle(req: Request) {
  if (
    !process.env.REPORT_TOKEN ||
    !process.env.RESEND_API_KEY ||
    !process.env.REPORT_TO
  ) {
    return NextResponse.json(
      {
        error:
          "Report emailing is not configured. Set REPORT_TOKEN, RESEND_API_KEY and REPORT_TO.",
      },
      { status: 503 }
    );
  }
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runReport();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    // Do NOT delete anything if the export/email failed.
    console.error("Log report failed:", e);
    return NextResponse.json(
      { error: (e as Error).message ?? "Report failed" },
      { status: 500 }
    );
  }
}

// Both verbs so any scheduler (cron-job.org, etc.) can trigger it.
export const GET = handle;
export const POST = handle;
