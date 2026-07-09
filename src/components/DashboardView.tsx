"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Position } from "@/generated/prisma/client";
import { ThemeToggle } from "@/components/ThemeToggle";
import { APP_TZ } from "@/lib/time";
import {
  DashboardSections,
  SideTasksSection,
  useNow,
  useAutoRefresh,
  useWakeLock,
  type EmployeeWithRelations,
  type JobWithRelations,
} from "@/components/DashboardSections";
import { ShiftHandoffBanner } from "@/components/ShiftHandoffBanner";

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
  tv = false,
}: {
  positions: Position[];
  employees: EmployeeWithRelations[];
  jobs: JobWithRelations[];
  isAdmin: boolean;
  announcements: string[];
  renderedAt: string;
  title: string;
  rotatingUrl?: string;
  rotationSeconds?: number;
  rotatingEnabled?: boolean;
  scrollSpeed?: number;
  tv?: boolean;
}) {
  const now = useNow();
  useAutoRefresh();
  useWakeLock(tv);

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
    // long sections scroll inside themselves instead). TV mode zooms, so its
    // height compensates (100vh / zoom) to still render exactly one screen.
    <div
      className="flex flex-1 flex-col lg:h-screen lg:flex-none lg:overflow-hidden"
      style={
        tv
          ? ({ zoom: 1.35, height: "calc(100vh / 1.35)" } as React.CSSProperties)
          : undefined
      }
    >
      <header className="grid shrink-0 grid-cols-3 items-center border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-lg font-semibold">{title}</h1>
        <div className="text-center">
          {now && (
            <>
              <div className="text-sm text-zinc-500 dark:text-zinc-400">
                {now.toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                  timeZone: APP_TZ,
                })}
              </div>
              <div className="text-3xl font-semibold tabular-nums">
                {now.toLocaleTimeString(undefined, {
                  hour: "numeric",
                  minute: "2-digit",
                  second: "2-digit",
                  timeZone: APP_TZ,
                })}
              </div>
              <div className="text-xs text-zinc-400 dark:text-zinc-500">
                Updated{" "}
                {new Date(renderedAt).toLocaleTimeString(undefined, {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                  timeZone: APP_TZ,
                })}
              </div>
            </>
          )}
        </div>
        <div className="flex items-center justify-end gap-4 text-sm">
          {tv ? (
            <Link
              href="/"
              className="text-zinc-500 hover:text-zinc-900 dark:text-zinc-500 dark:hover:text-white"
            >
              Exit TV
            </Link>
          ) : (
            <>
              <ThemeToggle />
              <Link
                href="/?tv=1"
                className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
              >
                TV mode
              </Link>
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
            </>
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
          <>
            {/* Handoff notes + Side Tasks share the top row; when there's no
                handoff note the banner wrapper is empty and tasks take the
                full width. */}
            <div className="mb-4 flex shrink-0 flex-wrap items-start gap-6">
              <div className="min-w-[300px] flex-1 empty:hidden">
                <ShiftHandoffBanner />
              </div>
              <div className="min-w-[300px] flex-1">
                <SideTasksSection
                  jobs={jobs}
                  compact
                  autoScroll
                  scrollSpeed={scrollSpeed}
                />
              </div>
            </div>
            <DashboardSections
              positions={positions}
              employees={employees}
              jobs={jobs}
              now={now}
              announcements={announcements}
              showPositions
              horizontalTasks
              autoScroll
              scrollSpeed={scrollSpeed}
              hideEmptyPositions
              hideTasks
              fill
              tv={tv}
            />
          </>
        )}
      </main>
    </div>
  );
}
