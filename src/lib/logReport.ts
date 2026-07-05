import { prisma } from "@/lib/prisma";
import { APP_TZ } from "@/lib/time";
import { sendEmail } from "@/lib/email";

const csvCell = (v: string) =>
  /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;

// One unified CSV of all log data — the activity log, the side-task log, and
// the per-day position work history — up to `cutoff`, ordered chronologically.
// Archived (terminated-employee) activity history is excluded and left in the DB.
export async function buildLogCsv(cutoff: Date) {
  const [activity, tasks, history] = await Promise.all([
    prisma.activityLog.findMany({
      where: { createdAt: { lte: cutoff }, archived: false },
      orderBy: { createdAt: "asc" },
    }),
    prisma.taskLog.findMany({
      where: { createdAt: { lte: cutoff } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.workHistory.findMany({
      where: { createdAt: { lte: cutoff } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const d = (dt: Date) => dt.toLocaleDateString(undefined, { timeZone: APP_TZ });
  const t = (dt: Date) => dt.toLocaleTimeString(undefined, { timeZone: APP_TZ });

  // [Date, Time, Source, Category/Task/Position, Change/Employee, By]
  const rows: { sortKey: number; cells: string[] }[] = [];
  for (const l of activity)
    rows.push({
      sortKey: l.createdAt.getTime(),
      cells: [d(l.createdAt), t(l.createdAt), "Activity", l.category, l.action, l.actorName ?? ""],
    });
  for (const l of tasks)
    rows.push({
      sortKey: l.createdAt.getTime(),
      cells: [d(l.createdAt), t(l.createdAt), "Side Task", l.jobTitle, l.action, ""],
    });
  for (const h of history)
    rows.push({
      sortKey: h.createdAt.getTime(),
      cells: [h.date, "", "Position History", h.positionTitle, h.employeeName, ""],
    });
  rows.sort((a, b) => a.sortKey - b.sortKey);

  const header = [
    "Date",
    "Time",
    "Source",
    "Category / Task / Position",
    "Change / Employee",
    "By",
  ];
  const csv = [header, ...rows.map((r) => r.cells)]
    .map((r) => r.map(csvCell).join(","))
    .join("\r\n");

  return {
    csv,
    activityCount: activity.length,
    taskCount: tasks.length,
    historyCount: history.length,
  };
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
  const { csv, activityCount, taskCount, historyCount } = await buildLogCsv(cutoff);
  if (activityCount === 0 && taskCount === 0 && historyCount === 0) {
    return { emailed: false, deleted: 0, message: "Nothing to export." };
  }

  const to = process.env.REPORT_TO!;
  const stamp = cutoff.toISOString().slice(0, 10);
  await sendEmail({
    to,
    subject: `Warehouse log export — ${stamp}`,
    text:
      `Full log export as of ${cutoff.toLocaleString(undefined, { timeZone: APP_TZ })} (Eastern).\n\n` +
      `Activity log entries: ${activityCount}\n` +
      `Side-task log entries: ${taskCount}\n` +
      `Position history entries: ${historyCount}\n\n` +
      `The activity + side-task rows are cleared from the database after this email. ` +
      `Position history is kept for 2 weeks then auto-deleted; employees, positions ` +
      `and equipment are untouched. Terminated-employee history is retained and not included.`,
    attachments: [
      { filename: `warehouse-logs-${stamp}.csv`, content: "﻿" + csv },
    ],
  });

  const deleted = await deleteLogs(cutoff);
  return { emailed: true, activityCount, taskCount, historyCount, deleted };
}
