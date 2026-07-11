"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Position } from "@/generated/prisma/client";
import { APP_TZ } from "@/lib/time";
import { splitNotices } from "@/lib/announcements";
import { upcomingScheduleDates } from "@/lib/schedule";
import {
  DashboardSections,
  useNow,
  useAutoRefresh,
  type EmployeeWithRelations,
  type JobWithRelations,
  type LaborShareItem,
} from "@/components/DashboardSections";
import type { Notice } from "@/components/NoticesManager";
import type { Branding } from "@/lib/settings";

// The admin's live mirror of the wall display (with coverage extras). Notices
// are managed on their own tab (/admin/notices). A day selector at the top lets
// the admin advance up to a week ahead to preview each employee's scheduled
// position for that day (the plans set on the Assign tab).
export function AdminDashboard({
  positions,
  employees,
  jobs,
  capabilities,
  notices,
  branding,
  laborShare = [],
}: {
  positions: Position[];
  employees: EmployeeWithRelations[];
  jobs: JobWithRelations[];
  capabilities: { id: string; name: string }[];
  notices: Notice[];
  branding?: Branding;
  laborShare?: LaborShareItem[];
}) {
  const now = useNow();
  useAutoRefresh();

  // Day-ahead preview: null = today's live board; a date string = previewing
  // that upcoming day's planned positions. `schedule` maps employeeId →
  // planned positionId for the selected date (from /api/schedule).
  const [previewDate, setPreviewDate] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<Record<string, string | null>>({});
  const scheduleDates = upcomingScheduleDates(now ?? new Date());
  const previewMode = previewDate !== null;

  // Load the selected day's plan; clear when back on Today. If the selected date
  // rolls out of the window (past midnight), fall back to Today.
  useEffect(() => {
    if (!previewDate) {
      setSchedule({});
      return;
    }
    if (!scheduleDates.some((d) => d.date === previewDate)) {
      setPreviewDate(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/schedule?date=${previewDate}`);
      if (!res.ok || cancelled) return;
      const rows: { employeeId: string; positionId: string | null }[] =
        await res.json();
      if (cancelled) return;
      setSchedule(
        Object.fromEntries(rows.map((r) => [r.employeeId, r.positionId]))
      );
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewDate]);

  // The notices currently on the board, re-derived against the live clock.
  const nowMs = now ? now.getTime() : Date.now();
  const active = notices.filter(
    (n) =>
      (!n.expiresAt || new Date(n.expiresAt).getTime() > nowMs) &&
      (!n.startsAt || new Date(n.startsAt).getTime() <= nowMs)
  );
  const { visible: live } = splitNotices(active);

  // In preview mode, position each employee by their planned position for the
  // day (and its title), so the board groups them under the scheduled position.
  const posById = new Map(positions.map((p) => [p.id, p]));
  const boardEmployees: EmployeeWithRelations[] = previewMode
    ? employees.map((e) => {
        const pid = schedule[e.id] ?? null;
        return {
          ...e,
          positionId: pid,
          position: pid ? posById.get(pid) ?? null : null,
          attendance: "PRESENT" as typeof e.attendance,
        };
      })
    : employees;

  const selectedLabel = scheduleDates.find((d) => d.date === previewDate)?.label;

  return (
    <div>
      <div className="mb-6 flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-semibold text-white">Admin Dashboard</h2>
        {now && (
          <div className="text-right">
            <div className="text-xs text-zinc-400">
              {now.toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
                timeZone: APP_TZ,
              })}
            </div>
            <div className="text-2xl font-semibold tabular-nums text-white">
              {now.toLocaleTimeString(undefined, {
                hour: "numeric",
                minute: "2-digit",
                second: "2-digit",
                timeZone: APP_TZ,
              })}
            </div>
          </div>
        )}
      </div>

      {/* Day selector: Today (live board) + upcoming weekdays to preview ahead. */}
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          onClick={() => setPreviewDate(null)}
          className={`rounded-md border px-3 py-1.5 text-sm ${
            !previewMode
              ? "border-blue-500 bg-blue-950/50 text-blue-200"
              : "border-zinc-700 text-zinc-300 hover:border-zinc-500"
          }`}
        >
          Today
        </button>
        {scheduleDates.map((d) => (
          <button
            key={d.date}
            onClick={() => setPreviewDate(d.date)}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              previewDate === d.date
                ? "border-blue-500 bg-blue-950/50 text-blue-200"
                : "border-zinc-700 text-zinc-300 hover:border-zinc-500"
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>

      {previewMode ? (
        <div className="mb-6 flex items-center justify-between gap-3 rounded-lg border border-blue-900 bg-blue-950/40 px-4 py-3">
          <p className="text-sm text-blue-200">
            Previewing scheduled positions for{" "}
            <span className="font-semibold">{selectedLabel}</span>. Set these
            plans on the Assign tab.
          </p>
          <Link
            href="/admin/assign"
            className="shrink-0 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500"
          >
            Edit plan
          </Link>
        </div>
      ) : (
        <div className="mb-6 flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3">
          <p className="text-sm text-zinc-400">
            {live.length === 0
              ? "No notices on the board."
              : `${live.length} notice${live.length === 1 ? "" : "s"} on the board.`}{" "}
            Post and manage notices on the Notices tab.
          </p>
          <Link
            href="/admin/notices"
            className="shrink-0 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500"
          >
            Manage notices
          </Link>
        </div>
      )}

      {/* Force dark styling — the admin panel is always dark regardless of the
          public site's light/dark theme. */}
      <div className="dark">
        {previewMode ? (
          <DashboardSections
            positions={positions}
            employees={boardEmployees}
            jobs={jobs}
            now={now}
            showPositions
            positionsOnly
            ignoreShift
            capabilities={capabilities}
          />
        ) : (
          <DashboardSections
            positions={positions}
            employees={employees}
            jobs={jobs}
            now={now}
            showPositions
            showCoverage
            capabilities={capabilities}
            announcements={live.map((n) => n.message)}
            brand={
              branding && {
                notice: branding.notice,
                handoff: branding.handoff,
                badge: branding.badge,
              }
            }
            laborShare={laborShare}
          />
        )}
      </div>
    </div>
  );
}
