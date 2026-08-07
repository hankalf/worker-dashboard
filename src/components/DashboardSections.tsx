"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { Job, Employee, Position, Role } from "@/generated/prisma/client";
import { appMinutes, APP_TZ } from "@/lib/time";
import {
  currentShift,
  SHIFTS,
  shiftRange,
  DEFAULT_SHIFT_BOUNDS,
  type ShiftBounds,
} from "@/lib/shift";
import {
  todayKey,
  anniversaryYearsThisMonth,
  isBirthday,
} from "@/lib/celebrations";
import { priorityLabel, priorityBadgeClass } from "@/lib/priority";
import { AutoScroll, ScrollSyncProvider } from "@/components/AutoScroll";
import { ShiftHandoffBanner } from "@/components/ShiftHandoffBanner";

// A live dock status pulled from Opendock and matched to this employee (by an
// appointment tag carrying their name). Null/absent when Opendock is off or the
// employee has no matching appointment.
export type DockStatus = {
  label: string;
  dock: string | null;
  tone: "requested" | "scheduled" | "arrived" | "active" | "done" | "other";
  role?: string | null; // the tag's role, e.g. "Receiver" / "Loader"
};

export type EmployeeWithRelations = Employee & {
  position: Position | null;
  roles: Role[];
  capabilities: { id: string; name: string }[];
  dockStatus?: DockStatus | null;
};

// Pill colours for each dock-status tone (light + dark).
const DOCK_TONE_CLASS: Record<DockStatus["tone"], string> = {
  requested: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  scheduled: "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200",
  arrived: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300",
  active: "bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300",
  done: "bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-300",
  other: "bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300",
};

// Optional brand accent colors (hex) for the board subtree.
export type Brand = { notice?: string; handoff?: string; badge?: string };

// A temporary borrowed worker shown on the board for their shift.
export type LaborShareItem = {
  id: string;
  name: string;
  shift: string;
  positionId: string | null;
  positionTitle: string | null;
  comingInAt: string | null;
  leavingAt: string | null;
};

// A banner tint (border + translucent background) from a brand color, or
// undefined to keep the element's default classes.
export const tintStyle = (color?: string): CSSProperties | undefined =>
  color
    ? {
        borderColor: color,
        backgroundColor: `color-mix(in srgb, ${color} 18%, transparent)`,
      }
    : undefined;

// A badge tint (brand color text on a translucent brand background), or
// undefined for the default classes.
export const badgeStyle = (color?: string): CSSProperties | undefined =>
  color
    ? {
        color,
        backgroundColor: `color-mix(in srgb, ${color} 22%, transparent)`,
      }
    : undefined;

export type JobWithRelations = Job & {
  assignedEmployee: (Employee & { position: Position | null }) | null;
};

const STATUS_LABELS: Record<string, string> = {
  UNASSIGNED: "Unassigned",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In Progress",
  DONE: "Done",
};

const STATUS_COLORS: Record<string, string> = {
  UNASSIGNED: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  ASSIGNED: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  IN_PROGRESS:
    "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  DONE: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
};

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

// End of an employee's lunch: their set end, or 30 minutes after the start.
const lunchEndMinutes = (emp: EmployeeWithRelations) => {
  if (!emp.lunchStart) return null;
  return emp.lunchEnd ? toMinutes(emp.lunchEnd) : toMinutes(emp.lunchStart) + 30;
};

const formatMinutes = (total: number) => {
  const h = String(Math.floor(total / 60) % 24).padStart(2, "0");
  const m = String(total % 60).padStart(2, "0");
  return `${h}:${m}`;
};

// "13:30" -> "1:30 PM"
export const formatClock = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

// A lunch list container. On the wall display (autoScroll) it joins the shared
// animated scroll clock, capped to ~4 rows so it stays a fixed slim size.
// Otherwise (the admin mirror) it gets a native scrollbar showing ~8 rows at a
// time, so a long lunch list is slimmed down but still fully scrollable.
function LunchPanel({
  autoScroll,
  speed,
  children,
}: {
  autoScroll: boolean;
  speed: number;
  children: ReactNode;
}) {
  const listClass =
    "divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900";
  if (autoScroll) {
    return (
      <AutoScroll enabled speed={speed} maxHeightClass="h-[9.5rem]">
        <ul className={`overflow-hidden ${listClass}`}>{children}</ul>
      </AutoScroll>
    );
  }
  return <ul className={`max-h-72 overflow-y-auto ${listClass}`}>{children}</ul>;
}

// Periodically soft-refreshes the current route's server data so displays
// pick up admin-panel changes without a manual reload (no full-page refresh,
// so client state like the clock is preserved).
export function useAutoRefresh(intervalMs = 15000) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);
}

// Live clock, initialised on mount to avoid a server/client time mismatch.
export function useNow() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

const ATTENDANCE_LABEL: Record<string, string> = {
  ABSENT: "Absent",
  CALLED_OUT: "Called out",
  PTO: "PTO",
};

// Card body for one employee: name on its own line, then all badges/chips and
// roles beneath it. Absent / called-out people are dimmed with a red badge.
function MemberBody({
  member,
  stayingOver = false,
  covering = false,
  today = null,
  hidePosition = false,
  hideLunch = false,
  badgeColor,
}: {
  member: EmployeeWithRelations;
  stayingOver?: boolean;
  covering?: boolean;
  today?: string | null;
  badgeColor?: string;
  // Public board groups by position already, so the per-card position line is
  // redundant there — hide it and show only roles.
  hidePosition?: boolean;
  // Public board shows lunch times in the Lunch Schedule list instead, so the
  // per-card lunch badge is hidden there (kept on the admin panel).
  hideLunch?: boolean;
}) {
  const anniv = today ? anniversaryYearsThisMonth(member.hireDate, today) : null;
  const birthday = today ? isBirthday(member.birthDate, today) : false;
  const out = member.attendance !== "PRESENT";
  return (
    <div className={out ? "opacity-60" : undefined}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {/* Name + status */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-medium">{member.name}</span>
            {member.isLead && (
              <span
                style={badgeStyle(badgeColor)}
                className="whitespace-nowrap rounded-full bg-teal-100 px-2 py-0.5 text-xs font-semibold text-teal-800 dark:bg-teal-500/20 dark:text-teal-300"
              >
                Lead
              </span>
            )}
            {out && (
              <span
                className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${
                  member.attendance === "PTO"
                    ? "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300"
                    : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                }`}
              >
                {ATTENDANCE_LABEL[member.attendance]}
              </span>
            )}
            {stayingOver && member.stayOverUntil && (
              <span className="whitespace-nowrap rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">
                Staying over til{" "}
                {new Date(member.stayOverUntil).toLocaleTimeString(undefined, {
                  hour: "numeric",
                  minute: "2-digit",
                  timeZone: APP_TZ,
                })}
              </span>
            )}
            {covering && (
              <span className="whitespace-nowrap rounded-full bg-cyan-100 px-2 py-0.5 text-xs font-semibold text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300">
                {member.comingInAt
                  ? `In at ${new Date(member.comingInAt).toLocaleTimeString(
                      undefined,
                      { hour: "numeric", minute: "2-digit", timeZone: APP_TZ }
                    )}`
                  : "Covering"}
                {member.shift ? ` (${SHIFTS[member.shift].label})` : ""}
              </span>
            )}
            {anniv && (
              <span className="whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
                🎉 {anniv} yr anniversary this month
              </span>
            )}
            {birthday && (
              <span className="whitespace-nowrap rounded-full bg-pink-100 px-2 py-0.5 text-xs font-semibold text-pink-700 dark:bg-pink-500/20 dark:text-pink-300">
                🎂 Birthday
              </span>
            )}
          </div>
          {/* Opendock assignment — its own line directly under the name, so it
              reads consistently on every card instead of wrapping around
              whichever other badges happen to be present. */}
          {member.dockStatus && (
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span
                className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${DOCK_TONE_CLASS[member.dockStatus.tone]}`}
              >
                🚛 {member.dockStatus.role ? `${member.dockStatus.role} · ` : ""}
                {member.dockStatus.dock ? `Door ${member.dockStatus.dock} · ` : ""}
                {member.dockStatus.label}
              </span>
            </div>
          )}
          {/* Position (hidden on the public board — grouped by position there) */}
          {!hidePosition && (
            <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {member.position?.title ?? "No position"}
            </div>
          )}
          {/* Roles (capabilities) — bold list */}
          {member.capabilities.length > 0 && (
            <div className="mt-1 text-xs font-bold text-zinc-700 dark:text-zinc-200">
              {member.capabilities.map((c) => c.name).join(" · ")}
            </div>
          )}
        </div>
        {/* Right corner: shift, then break, then lunch */}
        {(member.shift || member.breakStart || member.lunchStart) && (
          <span className="flex shrink-0 flex-col items-end gap-1">
            {member.shift && (
              <span
                style={badgeStyle(badgeColor)}
                className="whitespace-nowrap rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300"
              >
                {SHIFTS[member.shift].label}
              </span>
            )}
            {member.breakStart && (
              <span className="whitespace-nowrap rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800 dark:bg-orange-500/20 dark:text-orange-300">
                Break {formatClock(member.breakStart)}
              </span>
            )}
            {!hideLunch && member.lunchStart && (
              <span className="whitespace-nowrap rounded-full bg-green-700 px-2 py-0.5 text-xs font-medium text-white dark:bg-green-800 dark:text-green-100">
                Lunch {formatClock(member.lunchStart)}
              </span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

// The dashboard sections. `showPositions` groups the team into position
// columns (admin mirror); otherwise a flat roster is shown (public display,
// where positions are intentionally hidden). Pass `now` so shift/lunch logic
// recomputes as the clock ticks.
export function DashboardSections({
  positions,
  employees: allEmployees,
  jobs,
  now,
  showPositions = false,
  showCoverage = false,
  capabilities = [],
  announcements = [],
  autoScroll = false,
  scrollSpeed = 4,
  hideEmptyPositions = false,
  showHandoff = false,
  brand,
  laborShare = [],
  fill = false,
  ignoreShift = false,
  positionsOnly = false,
  shiftBounds = DEFAULT_SHIFT_BOUNDS,
}: {
  positions: Position[];
  employees: EmployeeWithRelations[];
  jobs: JobWithRelations[];
  now: Date | null;
  showPositions?: boolean;
  showCoverage?: boolean;
  capabilities?: { id: string; name: string }[];
  announcements?: string[];
  autoScroll?: boolean;
  // 1–10 slider value from settings; 4 ≈ the original pace.
  scrollSpeed?: number;
  hideEmptyPositions?: boolean;
  // Public board only: render the shift-handoff banner next to the notices
  // (the admin mirror edits handoff notes on the Assign tab instead).
  showHandoff?: boolean;
  // Optional brand accent colors (notices, handoff, badges).
  brand?: Brand;
  // Temporary borrowed workers to show for the active shift.
  laborShare?: LaborShareItem[];
  // Public board: lock to the viewport on lg+ screens — the positions section
  // flexes to the remaining height and scrolls inside itself (no page scroll).
  fill?: boolean;
  // Show every shift's crew, not just the one active at `now`. Used by the
  // admin day-ahead preview, where the board isn't tied to the current clock.
  ignoreShift?: boolean;
  // Render only the "Team by Position" grid (skip notices, lunches, coverage,
  // side tasks) — a focused view for the day-ahead schedule preview.
  positionsOnly?: boolean;
  // Admin-configured shift boundaries (drives currentShift + the range label).
  shiftBounds?: ShiftBounds;
}) {
  // Admins never appear on the boards; supervisors are working staff and do.
  const employees = allEmployees.filter((e) => e.accessLevel !== "ADMIN");
  // Show only the crew whose shift is active now (employees with no shift set
  // are always shown). Recomputes as the clock crosses a shift boundary.
  const shiftKey = now ? currentShift(now, shiftBounds) : null;
  const today = now ? todayKey(now) : null;
  // Slider value (1–10) → pixels per frame; 4 → 0.4px/frame (~24px/s).
  const scrollPxPerFrame = Math.max(1, Math.min(10, scrollSpeed)) * 0.1;

  // Staying over: still within their marked stay-over window (past shift end).
  const stayingOver = (e: EmployeeWithRelations) =>
    !!e.stayOverUntil &&
    !!now &&
    new Date(e.stayOverUntil).getTime() > now.getTime();
  // Covering: marked to work the current shift (e.g. came in early).
  const covering = (e: EmployeeWithRelations) =>
    !!e.coverUntil && !!now && new Date(e.coverUntil).getTime() > now.getTime();
  // Show current shift's crew (by clock) + anyone staying over or covering.
  // In `ignoreShift` mode (day-ahead preview) every shift's crew is shown.
  const onShift = (e: EmployeeWithRelations) =>
    ignoreShift ||
    !shiftKey ||
    e.shift === null ||
    e.shift === shiftKey ||
    stayingOver(e) ||
    covering(e);
  // Actively staying past their own shift (used for the badge).
  const stayingOverNow = (e: EmployeeWithRelations) =>
    stayingOver(e) && e.shift !== shiftKey;
  // Covering another shift (used for the badge).
  const coveringNow = (e: EmployeeWithRelations) =>
    covering(e) && e.shift !== shiftKey && !stayingOver(e);
  const present = (e: EmployeeWithRelations) => e.attendance === "PRESENT";
  // Actively working right now: present and on the current shift (or staying
  // over). These cards get a violet outline, matching the Assign board.
  const activeNow = (e: EmployeeWithRelations) => present(e) && onShift(e);

  // Labor-share for the active shift, grouped by their allotted position.
  const activeLabor = laborShare.filter((l) => !shiftKey || l.shift === shiftKey);
  const laborByPosition = (positionId: string) =>
    activeLabor.filter((l) => l.positionId === positionId);
  const noPositionLabor = activeLabor.filter((l) => !l.positionId);

  // The position's target minimum headcount for the active shift (0 = none).
  const targetFor = (position: Position) =>
    shiftKey === "FIRST"
      ? position.minFirst
      : shiftKey === "SECOND"
        ? position.minSecond
        : shiftKey === "THIRD"
          ? position.minThird
          : 0;

  // 1st → 2nd → 3rd, no-shift last (used when several shifts show together).
  const shiftRank = (s: string | null) =>
    s === "FIRST" ? 0 : s === "SECOND" ? 1 : s === "THIRD" ? 2 : 3;
  const columns = positions.map((position) => {
    const members = employees
      .filter((e) => e.positionId === position.id && onShift(e))
      // Leads first. In the day-ahead preview (all shifts shown together) then
      // by shift, then name; on the live board leads-first keeps the incoming
      // name order.
      .sort(
        (a, b) =>
          Number(b.isLead) - Number(a.isLead) ||
          (ignoreShift
            ? shiftRank(a.shift) - shiftRank(b.shift) ||
              a.name.localeCompare(b.name)
            : 0)
      );
    const labor = laborByPosition(position.id);
    // Labor-share count toward coverage.
    const presentCount = members.filter(present).length + labor.length;
    const target = targetFor(position);
    return {
      id: position.id,
      title: position.title,
      description: position.description,
      members,
      labor,
      presentCount,
      target,
      under: target > 0 && presentCount < target,
    };
  });
  const roster = employees.filter(onShift);

  // On the public board, hide positions with nobody on this shift (labor-share
  // counts as somebody).
  const visibleColumns = hideEmptyPositions
    ? columns.filter((c) => c.members.length > 0 || c.labor.length > 0)
    : columns;

  // Positions below their target for the active shift (admin view only).
  const understaffed = columns
    .filter((c) => c.under)
    .map((c) => `${c.title} (${c.presentCount}/${c.target})`);

  const onShiftCount = roster.length;
  const presentCount = roster.filter(present).length;

  const onLunch = now
    ? employees.filter((emp) => {
        const end = lunchEndMinutes(emp);
        if (end === null || !emp.lunchStart) return false;
        const cur = appMinutes(now);
        return cur >= toMinutes(emp.lunchStart) && cur < end;
      })
    : [];

  // Everyone on shift with a lunch time, ordered by when they go.
  const lunchSchedule = roster
    .filter((e) => e.lunchStart && e.attendance === "PRESENT")
    .sort((a, b) => toMinutes(a.lunchStart!) - toMinutes(b.lunchStart!));

  // Both lunch lists share one fixed height that fits ~4 compact rows, so they
  // stay the same size all the time and the 5th+ entry scrolls into view.
  const lunchBoxClass = "h-[9.5rem]";

  return (
    // One shared scroll clock keeps every auto-scrolling section in sync.
    <ScrollSyncProvider speed={scrollPxPerFrame}>
    <>
      {/* Row A: shift-handoff notes (public board only) next to the notices.
          A cell disappears when it has nothing to show; the other takes the
          full row (the banner renders null without a note → empty:hidden). */}
      {!positionsOnly && (showHandoff || announcements.length > 0) && (
        <div
          className={`${fill ? "mb-4 shrink-0" : "mb-8"} flex flex-wrap items-start gap-6`}
        >
          {showHandoff && (
            <div className="min-w-[300px] flex-1 empty:hidden">
              <ShiftHandoffBanner
                handoffColor={brand?.handoff}
                shiftBounds={shiftBounds}
              />
            </div>
          )}
          {announcements.length > 0 && (
            <div className="flex min-w-[300px] flex-1 flex-col gap-2">
              {announcements.map((message, i) => (
                <div
                  key={i}
                  // Brand color (when set) tints the border + background;
                  // otherwise the default blue classes apply.
                  style={tintStyle(brand?.notice)}
                  className="rounded-lg border border-blue-300 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-200"
                >
                  <span className="mr-2 font-semibold uppercase tracking-wide">
                    Notice
                  </span>
                  {message}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Row B: lunches (On Lunch + Lunch Schedule) next to the side tasks. */}
      {!positionsOnly && (
      <div
        className={`${fill ? "mb-4 shrink-0" : "mb-10"} flex flex-wrap items-start gap-6`}
      >
        <div className="grid min-w-[300px] flex-1 gap-4 sm:grid-cols-2">
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              On Lunch{onLunch.length > 0 ? ` (${onLunch.length})` : ""}
            </h2>
            {onLunch.length === 0 ? (
              <div
                className={`flex ${lunchBoxClass} items-center justify-center rounded-lg border border-zinc-200 bg-white text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400`}
              >
                No one is on lunch right now.
              </div>
            ) : (
              <LunchPanel autoScroll={autoScroll} speed={scrollPxPerFrame}>
                {onLunch.map((emp) => (
                  <li
                    key={emp.id}
                    className="flex items-center justify-between gap-3 px-4 py-2"
                  >
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span className="w-20 shrink-0 text-sm font-semibold tabular-nums text-amber-700 dark:text-amber-300">
                        {formatClock(formatMinutes(lunchEndMinutes(emp)!))}
                      </span>
                      <span className="truncate text-sm font-medium">
                        {emp.name}
                      </span>
                    </span>
                    {emp.roles.length > 0 && (
                      <span className="shrink-0 truncate text-xs text-zinc-500 dark:text-zinc-400">
                        {emp.roles.map((r) => r.name).join(" · ")}
                      </span>
                    )}
                  </li>
                ))}
              </LunchPanel>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Lunch Schedule
            </h2>
            {lunchSchedule.length === 0 ? (
              <div
                className={`flex ${lunchBoxClass} items-center justify-center rounded-lg border border-zinc-200 bg-white text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400`}
              >
                No lunches scheduled.
              </div>
            ) : (
              <LunchPanel autoScroll={autoScroll} speed={scrollPxPerFrame}>
                {lunchSchedule.map((emp) => (
                  <li
                    key={emp.id}
                    className="flex items-center justify-between gap-3 px-4 py-2"
                  >
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span className="w-20 shrink-0 text-sm font-semibold tabular-nums text-teal-700 dark:text-teal-300">
                        {formatClock(emp.lunchStart!)}
                      </span>
                      <span className="truncate text-sm font-medium">
                        {emp.name}
                      </span>
                    </span>
                    {showCoverage && emp.position && (
                      <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                        {emp.position.title}
                      </span>
                    )}
                  </li>
                ))}
              </LunchPanel>
            )}
          </section>
        </div>

        <div className="min-w-[300px] flex-1">
          <SideTasksSection
            jobs={jobs}
            compact
            autoScroll={autoScroll}
            scrollSpeed={scrollSpeed}
          />
        </div>
      </div>
      )}

      {showCoverage && understaffed.length > 0 && (
        <div className="mb-8 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">
          <span className="font-semibold">Understaffed this shift:</span>{" "}
          {understaffed.join(", ")}
        </div>
      )}

      {showCoverage && (
        <div className="mb-8 flex flex-wrap gap-2 text-sm">
          <span className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 dark:border-zinc-800 dark:bg-zinc-900">
            <span className="font-semibold">{presentCount}</span> present
          </span>
          <span className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
            {onShiftCount} on shift
          </span>
          {onLunch.length > 0 && (
            <span className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
              {onLunch.length} on lunch
            </span>
          )}
        </div>
      )}

      {/* Position coverage: how many present crew this shift are on each
          position (against its target min headcount, when set). */}
      {showCoverage && !ignoreShift && columns.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Position coverage{shiftKey ? ` — ${SHIFTS[shiftKey].label}` : ""}
          </h2>
          <div className="flex flex-wrap gap-2 text-sm">
            {columns.map((column) => {
              const short = column.under || column.presentCount === 0;
              return (
                <span
                  key={column.id}
                  className={`rounded-lg border px-3 py-1.5 ${
                    short
                      ? "border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300"
                      : "border-zinc-200 bg-white text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"
                  }`}
                >
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                    {column.presentCount}
                    {column.target > 0 ? `/${column.target}` : ""}
                  </span>{" "}
                  {column.title}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Role coverage: how many present crew this shift can perform each role. */}
      {showCoverage && capabilities.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Role coverage{shiftKey ? ` — ${SHIFTS[shiftKey].label}` : ""}
          </h2>
          <div className="flex flex-wrap gap-2 text-sm">
            {capabilities.map((cap) => {
              const count = roster.filter(
                (e) =>
                  present(e) && e.capabilities.some((c) => c.id === cap.id)
              ).length;
              return (
                <span
                  key={cap.id}
                  className={`rounded-lg border px-3 py-1.5 ${
                    count === 0
                      ? "border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300"
                      : "border-zinc-200 bg-white text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"
                  }`}
                >
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                    {count}
                  </span>{" "}
                  {cap.name}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* No celebrations banner — birthdays show on the employee's card on the
          day, anniversaries on the card for the whole month. */}

      {/* Labor-share with a position show inside that position's column below;
          only the ones with no position land in this standalone strip. */}
      {noPositionLabor.length > 0 && (
        <section className={fill ? "mb-4 shrink-0" : "mb-8"}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Labor Share{shiftKey ? ` — ${SHIFTS[shiftKey].label}` : ""} (
            {noPositionLabor.length})
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {noPositionLabor.map((l) => (
              <div
                key={l.id}
                className="rounded-lg border border-indigo-300 bg-indigo-50 p-3 dark:border-indigo-900 dark:bg-indigo-950/40"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{l.name}</span>
                  <span className="shrink-0 whitespace-nowrap rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
                    Labor Share
                  </span>
                </div>
                {(l.comingInAt || l.leavingAt) && (
                  <div className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                    {l.comingInAt ?? "?"}
                    {l.leavingAt ? `–${l.leavingAt}` : ""}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section
        className={
          fill
            ? "mb-4 flex flex-col lg:mb-0 lg:min-h-0 lg:flex-1"
            : "mb-10"
        }
      >
        <h2 className="mb-4 flex shrink-0 flex-wrap items-baseline gap-x-2 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {showPositions ? "Team by Position" : "Position"}
          {showPositions && shiftKey && !ignoreShift && (
            <span className="font-medium normal-case tracking-normal text-zinc-400 dark:text-zinc-500">
              — {SHIFTS[shiftKey].label} ({shiftRange(shiftKey, shiftBounds)})
            </span>
          )}
        </h2>

        {showPositions ? (
          visibleColumns.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {hideEmptyPositions
                ? "No one assigned to a position on this shift."
                : "No positions yet."}
            </p>
          ) : (
            <AutoScroll
              // In fill mode the section flexes to the leftover viewport height
              // and AutoScroll no-ops when the content already fits.
              enabled={autoScroll}
              speed={scrollPxPerFrame}
              // Positions is the scroll leader — every other section tracks it.
              syncLeader
              maxHeightClass={
                fill
                  ? "max-h-[48vh] lg:max-h-none lg:min-h-0 lg:flex-1"
                  : "max-h-[48vh]"
              }
            >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visibleColumns.map((column) => (
                <div
                  key={column.id}
                  className="flex flex-col rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold">{column.title}</h3>
                      {column.description && (
                        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                          {column.description}
                        </p>
                      )}
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
                        column.under || (column.target === 0 && column.presentCount === 0)
                          ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                          : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                      }`}
                    >
                      {column.presentCount}
                      {column.target > 0 ? `/${column.target}` : ""} present
                    </span>
                  </div>
                  {column.members.length === 0 && column.labor.length === 0 ? (
                    <p className="text-sm text-zinc-400 dark:text-zinc-600">
                      No one assigned
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-3">
                      {column.members.map((member) => (
                        <li
                          key={member.id}
                          className={`rounded-md border px-3 py-3 ${
                            showCoverage && activeNow(member)
                              ? "border-violet-400 bg-violet-50 ring-1 ring-violet-400 dark:border-violet-600 dark:bg-violet-950/30 dark:ring-violet-600"
                              : "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/50"
                          }`}
                        >
                          <MemberBody member={member} stayingOver={stayingOverNow(member)} covering={coveringNow(member)} today={today} hidePosition={!showCoverage} hideLunch={!showCoverage} badgeColor={brand?.badge} />
                        </li>
                      ))}
                      {column.labor.map((l) => (
                        <li
                          key={l.id}
                          className="rounded-md border border-indigo-300 bg-indigo-50 px-3 py-3 dark:border-indigo-800 dark:bg-indigo-950/40"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-medium">
                              {l.name}
                            </span>
                            <span className="shrink-0 whitespace-nowrap rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
                              Labor Share
                            </span>
                          </div>
                          {(l.comingInAt || l.leavingAt) && (
                            <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                              {l.comingInAt ?? "?"}
                              {l.leavingAt ? `–${l.leavingAt}` : ""}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
            </AutoScroll>
          )
        ) : roster.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No one on shift right now.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {roster.map((member) => (
              <div
                key={member.id}
                className={`rounded-lg border p-4 shadow-sm ${
                  showCoverage && activeNow(member)
                    ? "border-violet-400 bg-violet-50 ring-1 ring-violet-400 dark:border-violet-600 dark:bg-violet-950/30 dark:ring-violet-600"
                    : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                }`}
              >
                <MemberBody member={member} stayingOver={stayingOverNow(member)} covering={coveringNow(member)} today={today} hidePosition={!showCoverage} hideLunch={!showCoverage} badgeColor={brand?.badge} />
              </div>
            ))}
          </div>
        )}
      </section>

    </>
    </ScrollSyncProvider>
  );
}

// The Side Tasks section, grouped by assigned employee (unassigned last), each
// group's tasks ordered by priority. Standalone so the public dashboard can
// place it next to the handoff notes while the admin mirror keeps it below.
export function SideTasksSection({
  jobs,
  showPositions = false,
  horizontal = false,
  // Tighter grid + height for the top-row slot beside the handoff notes.
  compact = false,
  autoScroll = false,
  scrollSpeed = 4,
}: {
  jobs: JobWithRelations[];
  showPositions?: boolean;
  horizontal?: boolean;
  compact?: boolean;
  autoScroll?: boolean;
  scrollSpeed?: number;
}) {
  const speed = Math.max(1, Math.min(10, scrollSpeed)) * 0.1;
  const jobGroups = (() => {
    const map = new Map<
      string,
      { name: string; position: string | null; jobs: JobWithRelations[] }
    >();
    for (const job of jobs) {
      const key = job.assignedEmployee?.id ?? "__unassigned__";
      if (!map.has(key)) {
        map.set(key, {
          name: job.assignedEmployee?.name ?? "Unassigned",
          position: job.assignedEmployee?.position?.title ?? null,
          jobs: [],
        });
      }
      map.get(key)!.jobs.push(job);
    }
    const groups = [...map.values()];
    groups.forEach((g) => g.jobs.sort((a, b) => b.priority - a.priority));
    groups.sort((a, b) => {
      if (a.name === "Unassigned") return 1;
      if (b.name === "Unassigned") return -1;
      return a.name.localeCompare(b.name);
    });
    return groups;
  })();

  return (
    <section>
      <h2
        className={`${compact ? "mb-2" : "mb-4"} text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400`}
      >
        Side Tasks
      </h2>
      {jobs.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No side tasks yet.
        </p>
      ) : compact ? (
        // Slim top-row variant: one line per task (title · chips · assignee),
        // no descriptions — details live on the admin Side Tasks tab.
        <AutoScroll enabled={autoScroll} speed={speed} maxHeightClass="max-h-[20vh]">
          <ul className="divide-y divide-zinc-200 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
            {jobGroups.flatMap((group) =>
              group.jobs.map((job) => (
                <li
                  key={job.id}
                  className="flex items-center gap-2 px-3 py-1.5"
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {job.title}
                  </span>
                  {priorityBadgeClass(job.priority) && (
                    <span
                      className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium ${priorityBadgeClass(job.priority)}`}
                    >
                      {priorityLabel(job.priority)}
                    </span>
                  )}
                  <span
                    className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[job.status]}`}
                  >
                    {STATUS_LABELS[job.status]}
                  </span>
                  <span className="w-24 shrink-0 truncate text-right text-xs text-zinc-500 dark:text-zinc-400">
                    {group.name}
                  </span>
                </li>
              ))
            )}
          </ul>
        </AutoScroll>
      ) : (
        <AutoScroll enabled={autoScroll} speed={speed} maxHeightClass="max-h-[40vh]">
          <div
            className={
              horizontal
                ? "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                : "flex flex-col gap-6"
            }
          >
            {jobGroups.map((group) => (
              <div key={group.name}>
                <h3 className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  {group.name}
                  {showPositions && group.position ? ` · ${group.position}` : ""}
                </h3>
                <div
                  className={
                    horizontal
                      ? "flex flex-col gap-4"
                      : "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
                  }
                >
                  {group.jobs.map((job) => (
                    <div
                      key={job.id}
                      className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
                    >
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <h3 className="font-medium">{job.title}</h3>
                        <span className="flex shrink-0 flex-col items-end gap-1">
                          <span
                            className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[job.status]}`}
                          >
                            {STATUS_LABELS[job.status]}
                          </span>
                          {priorityBadgeClass(job.priority) && (
                            <span
                              className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${priorityBadgeClass(job.priority)}`}
                            >
                              {priorityLabel(job.priority)}
                            </span>
                          )}
                        </span>
                      </div>
                      {job.description && (
                        <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
                          {job.description}
                        </p>
                      )}
                      {job.dueDate && (
                        <div className="text-xs text-zinc-500 dark:text-zinc-400">
                          Due:{" "}
                          {new Date(job.dueDate).toLocaleDateString(undefined, {
                            timeZone: "UTC",
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </AutoScroll>
      )}
    </section>
  );
}
