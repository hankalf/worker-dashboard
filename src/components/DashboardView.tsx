"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Position } from "@/generated/prisma/client";
import type { Branding } from "@/lib/settings";
import { ThemeToggle } from "@/components/ThemeToggle";
import { APP_TZ } from "@/lib/time";
import {
  DashboardSections,
  useNow,
  useAutoRefresh,
  type EmployeeWithRelations,
  type JobWithRelations,
  type LaborShareItem,
} from "@/components/DashboardSections";

export function DashboardView({
  positions,
  employees,
  jobs,
  isAdmin,
  announcements,
  renderedAt,
  title,
  rotatingUrl = "",
  rotationSeconds = 30,
  rotatingEnabled = false,
  scrollSpeed = 4,
  branding,
  laborShare = [],
  version = "",
}: {
  positions: Position[];
  employees: EmployeeWithRelations[];
  jobs: JobWithRelations[];
  isAdmin: boolean;
  announcements: string[];
  renderedAt: string;
  title: string;
  branding?: Branding;
  laborShare?: LaborShareItem[];
  version?: string;
  rotatingUrl?: string;
  rotationSeconds?: number;
  rotatingEnabled?: boolean;
  scrollSpeed?: number;
}) {
  const now = useNow();
  useAutoRefresh();

  // Rotating display: alternate the body between the board and an external URL
  // (the header with the clock/date stays put). Off unless enabled + a URL set.
  const rotating = rotatingEnabled && !!rotatingUrl;
  const [showingUrl, setShowingUrl] = useState(false);
  useEffect(() => {
    if (!rotating) {
      setShowingUrl(false);
      return;
    }
    const id = setInterval(
      () => setShowingUrl((s) => !s),
      Math.max(5, rotationSeconds) * 1000
    );
    return () => clearInterval(id);
  }, [rotating, rotationSeconds]);

  return (
    // On lg+ screens the board locks to the viewport height (no page scroll —
    // long sections scroll inside themselves instead).
    <div className="flex flex-1 flex-col lg:h-screen lg:flex-none lg:overflow-hidden">
      <header
        style={{
          backgroundColor: branding?.headerBg || undefined,
          color: branding?.headerFg || undefined,
        }}
        className="grid shrink-0 grid-cols-3 items-center border-b border-zinc-200 bg-white px-6 py-2 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            {branding?.logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={branding.logo} alt="" className="h-7 w-auto max-w-[7rem] object-contain" />
            )}
            {title}
          </h1>
          {now && (
            <div className="text-[11px] text-zinc-400 dark:text-zinc-500">
              Updated{" "}
              {new Date(renderedAt).toLocaleTimeString(undefined, {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                timeZone: APP_TZ,
              })}
            </div>
          )}
        </div>
        <div className="text-center leading-tight">
          {now && (
            <>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                {now.toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                  timeZone: APP_TZ,
                })}
              </div>
              <div className="text-2xl font-semibold tabular-nums">
                {now.toLocaleTimeString(undefined, {
                  hour: "numeric",
                  minute: "2-digit",
                  second: "2-digit",
                  timeZone: APP_TZ,
                })}
              </div>
            </>
          )}
        </div>
        <div className="flex items-center justify-end gap-4 text-sm">
          <ThemeToggle />
          {isAdmin ? (
            <Link
              href="/admin/assign"
              className="rounded-md bg-zinc-900 px-3 py-1.5 font-medium text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Admin Panel
            </Link>
          ) : (
            <Link
              href="/login"
              className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
            >
              Admin login
            </Link>
          )}
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col px-6 py-4 lg:overflow-hidden">
        {rotating && showingUrl ? (
          <iframe
            src={rotatingUrl}
            title="Rotating display"
            className="min-h-0 w-full flex-1 rounded-lg border border-zinc-200 bg-white dark:border-zinc-800"
          />
        ) : (
          <DashboardSections
            positions={positions}
            employees={employees}
            jobs={jobs}
            now={now}
            announcements={announcements}
            showPositions
            showHandoff
            autoScroll
            scrollSpeed={scrollSpeed}
            hideEmptyPositions
            brand={
              branding && {
                notice: branding.notice,
                handoff: branding.handoff,
                badge: branding.badge,
              }
            }
            laborShare={laborShare}
            fill
          />
        )}
      </main>

      {version && (
        <footer className="shrink-0 border-t border-zinc-200 px-6 py-1 text-right text-[10px] text-zinc-400 dark:border-zinc-800 dark:text-zinc-600">
          {version}
        </footer>
      )}
    </div>
  );
}
