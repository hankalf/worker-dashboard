"use client";

import Link from "next/link";
import type { Position } from "@/generated/prisma/client";
import { APP_TZ } from "@/lib/time";
import { splitNotices } from "@/lib/announcements";
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
// are managed on their own tab (/admin/notices).
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

  // The notices currently on the board, re-derived against the live clock.
  const nowMs = now ? now.getTime() : Date.now();
  const active = notices.filter(
    (n) =>
      (!n.expiresAt || new Date(n.expiresAt).getTime() > nowMs) &&
      (!n.startsAt || new Date(n.startsAt).getTime() <= nowMs)
  );
  const { visible: live } = splitNotices(active);

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

      {/* Force dark styling — the admin panel is always dark regardless of the
          public site's light/dark theme. */}
      <div className="dark">
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
      </div>
    </div>
  );
}
