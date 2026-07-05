import { prisma } from "@/lib/prisma";
import { APP_TZ } from "@/lib/time";
import { sendEmail } from "@/lib/email";

const csvCell = (v: string) =>
  /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;

// One unified CSV of all log data — the activity log plus the side-task log —
// up to `cutoff`, ordered chronologically. Archived (terminated-employee)
// activity history is excluded and left in the database.
export async function buildLogCsv(cutoff: Date) {
  const [activity, tasks] = await Promise.all([
    prisma.activityLog.findMany({
      where: { createdAt: { lte: cutoff }, archived: false },
      orderBy: { createdAt: "asc" },
    }),
    prisma.taskLog.findMany({
      where: { createdAt: { lte: cutoff } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const entries: { at: Date; cols: string[] }[] = [];
  for (const l of activity)
    entries.push({
      at: l.createdAt,
      cols: ["Activity", l.category, l.action, l.actorName ?? ""],
    });
  for (const l of tasks)
    entries.push({ at: l.createdAt, cols: ["Side Task", l.jobTitle, l.action, ""] });
  entries.sort((a, b) => a.at.getTime() - b.at.getTime());

  const header = ["Date", "Time", "Source", "Category / Task", "Change", "By"];
  const rows = entries.map((e) => [
    e.at.toLocaleDateString(undefined, { timeZone: APP_TZ }),
    e.at.toLocaleTimeString(undefined, { timeZone: APP_TZ }),
    ...e.cols,
  ]);
  const csv = [header, ...rows]
    .map((r) => r.map(csvCell).join(","))
    .join("\r\n");

  return { csv, activityCount: activity.length, taskCount: tasks.length };
}

// Delete the exported rows (keeping archived activity history).
export async function deleteLogs(cutoff: Date) {
  const [a, t] = await Promise.all([
    prisma.activityLog.deleteMany({
      where: { createdAt: { lte: cutoff }, archived: false },
    }),
    prisma.taskLog.deleteMany({ where: { createdAt: { lte: cutoff } } }),
  ]);
  return a.count + t.count;
}

// Email the export, then (only on success) delete the exported rows.
export async function runEmailReport() {
  const cutoff = new Date();
  const { csv, activityCount, taskCount } = await buildLogCsv(cutoff);
  if (activityCount === 0 && taskCount === 0) {
    return { emailed: false, deleted: 0, message: "No logs to export." };
  }

  const to = process.env.REPORT_TO!;
  const stamp = cutoff.toISOString().slice(0, 10);
  await sendEmail({
    to,
    subject: `Warehouse log export — ${stamp}`,
    text:
      `Full log export as of ${cutoff.toLocaleString(undefined, { timeZone: APP_TZ })} (Eastern).\n\n` +
      `Activity log entries: ${activityCount}\n` +
      `Side-task log entries: ${taskCount}\n\n` +
      `These rows are cleared from the database after this email. ` +
      `Terminated-employee history is retained and not included.`,
    attachments: [
      { filename: `warehouse-logs-${stamp}.csv`, content: "﻿" + csv },
    ],
  });

  const deleted = await deleteLogs(cutoff);
  return { emailed: true, activityCount, taskCount, deleted };
}
