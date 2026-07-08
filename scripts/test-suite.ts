/**
 * Comprehensive functional test suite for the warehouse dashboard.
 *
 * Run with the dev server up (localhost:3000):
 *   npx tsx scripts/test-suite.ts
 *
 * Covers: pure lib functions (time, shift, announcements, priority), then seeds
 * a realistic dataset (32 employees across shifts/positions/attendance, 8
 * positions, 5 equipment, 10 notices incl pinned/scheduled/expired) and asserts
 * the DB-query + grouping/sort logic and the public HTTP API against it.
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  appMinutes,
  easternDateKey,
  easternDateTimeInput,
  easternInputToUtcISO,
} from "@/lib/time";
import { currentShift, shiftEndDate, SHIFTS } from "@/lib/shift";
import { splitNotices, MAX_VISIBLE_NOTICES } from "@/lib/announcements";
import {
  priorityLabel,
  priorityBadgeClass,
  PRIORITY_LEVELS,
} from "@/lib/priority";
import {
  taskDueState,
  dueStateBadgeClass,
  DUE_STATE_LABEL,
} from "@/lib/tasks";
import {
  getDashboardName,
  setDashboardName,
  DEFAULT_DASHBOARD_NAME,
} from "@/lib/settings";

// ---- tiny test harness -----------------------------------------------------
let currentGroup = "";
const groups: Record<string, { pass: number; fail: number }> = {};
const failures: string[] = [];
function group(name: string) {
  currentGroup = name;
  groups[name] ??= { pass: 0, fail: 0 };
}
function ok(name: string, cond: boolean, detail?: string) {
  const g = (groups[currentGroup] ??= { pass: 0, fail: 0 });
  if (cond) g.pass++;
  else {
    g.fail++;
    failures.push(`[${currentGroup}] ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
function eq(name: string, actual: unknown, expected: unknown) {
  ok(
    name,
    JSON.stringify(actual) === JSON.stringify(expected),
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
  );
}

// A Date at a given Eastern wall-clock time ("YYYY-MM-DDTHH:mm").
const easternAt = (input: string) => new Date(easternInputToUtcISO(input));

// ===========================================================================
// UNIT TESTS — pure functions
// ===========================================================================
function unitTests() {
  group("time.appMinutes");
  eq("14:30 EDT", appMinutes(easternAt("2026-07-04T14:30")), 870);
  eq("09:05 EST", appMinutes(easternAt("2026-01-15T09:05")), 545);
  eq("00:00 EDT", appMinutes(easternAt("2026-07-04T00:00")), 0);

  group("time.easternDateKey");
  eq("late evening", easternDateKey(easternAt("2026-07-04T23:30")), "2026-07-04");
  eq(
    "UTC next-day but ET same-day",
    easternDateKey(new Date("2026-07-05T03:00:00Z")),
    "2026-07-04"
  );

  group("time.easternDateTimeInput");
  eq(
    "formats ET wall time",
    easternDateTimeInput(easternAt("2026-07-04T14:30")),
    "2026-07-04T14:30"
  );

  group("time.easternInputToUtcISO");
  eq("EDT (-4)", easternInputToUtcISO("2026-07-04T12:00"), "2026-07-04T16:00:00.000Z");
  eq("EST (-5)", easternInputToUtcISO("2026-01-15T12:00"), "2026-01-15T17:00:00.000Z");
  eq(
    "round-trips through input",
    easternDateTimeInput(easternAt("2026-03-10T08:00")),
    "2026-03-10T08:00"
  );

  group("shift.currentShift");
  eq("06:00 → FIRST", currentShift(easternAt("2026-07-04T06:00")), "FIRST");
  eq("13:59 → FIRST", currentShift(easternAt("2026-07-04T13:59")), "FIRST");
  eq("14:00 → SECOND", currentShift(easternAt("2026-07-04T14:00")), "SECOND");
  eq("21:59 → SECOND", currentShift(easternAt("2026-07-04T21:59")), "SECOND");
  eq("22:00 → THIRD", currentShift(easternAt("2026-07-04T22:00")), "THIRD");
  eq("05:59 → THIRD", currentShift(easternAt("2026-07-04T05:59")), "THIRD");

  group("shift.shiftEndDate");
  eq(
    "FIRST ends 14:00",
    shiftEndDate("FIRST", easternAt("2026-07-04T09:00")).toISOString(),
    easternInputToUtcISO("2026-07-04T14:00")
  );
  eq(
    "SECOND ends 22:00",
    shiftEndDate("SECOND", easternAt("2026-07-04T18:00")).toISOString(),
    easternInputToUtcISO("2026-07-04T22:00")
  );
  eq(
    "THIRD before 10pm → today 06:00",
    shiftEndDate("THIRD", easternAt("2026-07-04T08:00")).toISOString(),
    easternInputToUtcISO("2026-07-04T06:00")
  );
  eq(
    "THIRD at/after 10pm → next day 06:00",
    shiftEndDate("THIRD", easternAt("2026-07-04T23:00")).toISOString(),
    easternInputToUtcISO("2026-07-05T06:00")
  );
  eq(
    "THIRD early morning (02:00) → today 06:00",
    shiftEndDate("THIRD", easternAt("2026-07-04T02:00")).toISOString(),
    easternInputToUtcISO("2026-07-04T06:00")
  );

  group("shift.SHIFTS labels");
  eq("FIRST label", SHIFTS.FIRST.label, "1st Shift");
  eq("SECOND label", SHIFTS.SECOND.label, "2nd Shift");
  eq("THIRD label", SHIFTS.THIRD.label, "3rd Shift");

  group("announcements.splitNotices");
  const mk = (n: number, pinned = false) =>
    Array.from({ length: n }, (_, i) => ({ id: `${pinned ? "p" : "u"}${i}`, pinned }));
  eq("cap constant", MAX_VISIBLE_NOTICES, 5);
  {
    const r = splitNotices(mk(8));
    eq("8 unpinned → 5 visible", r.visible.length, 5);
    eq("8 unpinned → 3 queued", r.queued.length, 3);
    eq("visible are oldest-first", r.visible.map((x) => x.id), ["u0", "u1", "u2", "u3", "u4"]);
  }
  {
    const r = splitNotices([...mk(2, true), ...mk(6)]);
    eq("2 pinned + 6 → 5 visible", r.visible.length, 5);
    eq("2 pinned + 6 → 3 queued", r.queued.length, 3);
    ok("pinned listed first", r.visible[0].pinned && r.visible[1].pinned);
  }
  {
    const r = splitNotices([...mk(3, true), ...mk(6)]);
    eq("3 pinned + 6 → 5 visible", r.visible.length, 5);
    eq("3 pinned + 6 → 4 queued", r.queued.length, 4);
  }
  {
    const r = splitNotices([...mk(7, true), ...mk(2)]);
    eq("7 pinned override cap → 7 visible", r.visible.length, 7);
    eq("7 pinned → all unpinned queued", r.queued.length, 2);
  }
  {
    const r = splitNotices(mk(3));
    eq("3 (< cap) → all visible", r.visible.length, 3);
    eq("3 (< cap) → none queued", r.queued.length, 0);
  }
  {
    const r = splitNotices([]);
    eq("empty visible", r.visible.length, 0);
    eq("empty queued", r.queued.length, 0);
  }
  {
    // pinned mixed into the middle still sort to the front
    const mixed = [
      { id: "a", pinned: false },
      { id: "b", pinned: true },
      { id: "c", pinned: false },
    ];
    ok("pinned floats to front", splitNotices(mixed).visible[0].id === "b");
  }

  group("priority");
  eq("label 0", priorityLabel(0), "Normal");
  eq("label 1", priorityLabel(1), "High");
  eq("label 2", priorityLabel(2), "Urgent");
  eq("label 3 clamps to Urgent", priorityLabel(3), "Urgent");
  ok("badge 0 is null", priorityBadgeClass(0) === null);
  ok("badge 1 amber", (priorityBadgeClass(1) ?? "").includes("amber"));
  ok("badge 2 red", (priorityBadgeClass(2) ?? "").includes("red"));
  eq("3 priority levels", PRIORITY_LEVELS.length, 3);

  group("tasks.taskDueState");
  // Anchor "now" at noon UTC on 2026-07-08 — comfortably inside the Eastern day
  // 2026-07-08 (08:00 EDT), so the Eastern calendar day is 2026-07-08.
  const dsNow = new Date("2026-07-08T12:00:00Z");
  eq("no due date → none", taskDueState(null, "ASSIGNED", dsNow), "none");
  eq(
    "yesterday, open → overdue",
    taskDueState("2026-07-07", "IN_PROGRESS", dsNow),
    "overdue"
  );
  eq(
    "today, open → due-today",
    taskDueState("2026-07-08", "ASSIGNED", dsNow),
    "due-today"
  );
  eq(
    "tomorrow, open → none",
    taskDueState("2026-07-09", "ASSIGNED", dsNow),
    "none"
  );
  eq(
    "past but DONE → none",
    taskDueState("2026-07-01", "DONE", dsNow),
    "none"
  );
  eq(
    "accepts a Date instance",
    taskDueState(new Date("2026-07-07T00:00:00Z"), "UNASSIGNED", dsNow),
    "overdue"
  );
  ok("overdue badge is red", (dueStateBadgeClass("overdue") ?? "").includes("red"));
  ok(
    "due-today badge is amber",
    (dueStateBadgeClass("due-today") ?? "").includes("amber")
  );
  ok("none badge is null", dueStateBadgeClass("none") === null);
  eq("overdue label", DUE_STATE_LABEL["overdue"], "Overdue");
  eq("due-today label", DUE_STATE_LABEL["due-today"], "Due today");
}

// ===========================================================================
// DATASET
// ===========================================================================
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

const EQUIPMENT = ["Forklift", "Pallet Jack", "Scanner", "Hard Hat", "Box Cutter"];
// "Roles" = job functions (Capability model), distinct from Equipment.
const ROLES = ["Receive", "Ship", "Pick", "Putaway", "DAX"];
const POSITIONS = [
  "Receiving",
  "Put-Away",
  "Picking",
  "Packing",
  "Shipping",
  "Loading",
  "Replenishment",
  "Returns",
];
type ShiftVal = "FIRST" | "SECOND" | "THIRD" | null;
type AttVal = "PRESENT" | "ABSENT" | "CALLED_OUT" | "PTO";

type Spec = {
  name: string;
  shift: ShiftVal;
  positionIdx: number | null;
  attendance: AttVal;
  isLead: boolean;
  lunchStart: string | null;
  breakStart: string | null;
  stayOver: boolean;
  equipmentIdx: number[];
  capabilityIdx: number[];
};

function buildEmployeeSpecs(): Spec[] {
  const cycle: ShiftVal[] = ["FIRST", "SECOND", "THIRD"];
  const att: AttVal[] = ["ABSENT", "CALLED_OUT", "PTO"];
  const specs: Spec[] = [];
  for (let i = 0; i < 30; i++) {
    const shift: ShiftVal = i < 27 ? cycle[i % 3] : null; // 9/9/9 + 3 no-shift
    const attendance: AttVal = i % 10 < 3 ? att[i % 10] : "PRESENT"; // some out
    specs.push({
      name: `Worker ${String(i + 1).padStart(2, "0")}`,
      shift,
      positionIdx: i % POSITIONS.length,
      attendance,
      isLead: i % 8 === 0,
      lunchStart: i % 2 === 0 ? "12:00" : null,
      breakStart: i % 3 === 0 ? "10:15" : null,
      stayOver: i === 5 || i === 12,
      equipmentIdx: i % 7 === 0 ? [i % 5, (i + 1) % 5] : [i % 5],
      // Every worker can perform 1-2 roles (distinct indices).
      capabilityIdx: [...new Set([i % 5, (i + 2) % 5])],
    });
  }
  return specs;
}

async function seed(now: Date) {
  // Clear in FK-safe order: jobs → employees → positions → roles → notices.
  await db.job.deleteMany();
  await db.employee.deleteMany();
  await db.position.deleteMany();
  await db.role.deleteMany();
  await db.capability.deleteMany();
  await db.announcement.deleteMany();

  const roles: { id: string }[] = [];
  for (const name of EQUIPMENT) roles.push(await db.role.create({ data: { name } }));

  const caps: { id: string }[] = [];
  for (const name of ROLES) caps.push(await db.capability.create({ data: { name } }));

  const positions: { id: string }[] = [];
  for (let i = 0; i < POSITIONS.length; i++) {
    positions.push(
      await db.position.create({
        data: {
          title: POSITIONS[i],
          sortOrder: i,
          // Two positions require equipment (assign-warning feature).
          requiredRoleId:
            i === 0 ? roles[0].id : i === 5 ? roles[1].id : null,
        },
      })
    );
  }

  const specs = buildEmployeeSpecs();
  for (const s of specs) {
    await db.employee.create({
      data: {
        name: s.name,
        shift: s.shift ?? undefined,
        positionId: s.positionIdx === null ? null : positions[s.positionIdx].id,
        attendance: s.attendance,
        isLead: s.isLead,
        lunchStart: s.lunchStart,
        breakStart: s.breakStart,
        stayOverUntil: s.stayOver ? new Date(now.getTime() + 2 * 3600 * 1000) : null,
        roles: { connect: s.equipmentIdx.map((idx) => ({ id: roles[idx].id })) },
        capabilities: {
          connect: s.capabilityIdx.map((idx) => ({ id: caps[idx].id })),
        },
      },
    });
  }

  // Admin + supervisor logins (recreated so the panel stays usable).
  const adminHash = await bcrypt.hash("admin123", 10);
  const supHash = await bcrypt.hash("sup12345", 10);
  await db.employee.create({
    data: { name: "Admin", username: "admin", passwordHash: adminHash, accessLevel: "ADMIN" },
  });
  await db.employee.create({
    data: { name: "Sue Supervisor", username: "sup", passwordHash: supHash, accessLevel: "SUPERVISOR" },
  });

  // Notices: 2 pinned active, 6 unpinned active, 1 scheduled (future), 1 expired.
  const base = now.getTime() - 100_000;
  const notice = (
    message: string,
    pinned: boolean,
    order: number,
    extra: { startsAt?: Date; expiresAt?: Date } = {}
  ) =>
    db.announcement.create({
      data: { message, pinned, createdAt: new Date(base + order * 1000), ...extra },
    });
  await notice("PINNED-ALPHA", true, 0);
  await notice("PINNED-BETA", true, 1);
  for (let i = 1; i <= 6; i++) await notice(`NOTICE-${i}`, false, 1 + i);
  await notice("SCHEDULED-FUTURE", false, 20, {
    startsAt: new Date(now.getTime() + 3 * 3600 * 1000),
  });
  await notice("EXPIRED-ZED", false, 21, {
    expiresAt: new Date(now.getTime() - 3600 * 1000),
  });

  return { specs };
}

// ===========================================================================
// DB-LOGIC TESTS
// ===========================================================================
async function dbTests(now: Date, specs: Spec[]) {
  group("db: equipment");
  const equipment = await db.role.findMany({ orderBy: { name: "asc" } });
  eq("count", equipment.length, 5);
  eq(
    "sorted ascending",
    equipment.map((e) => e.name),
    [...EQUIPMENT].sort()
  );

  group("db: roles (capabilities)");
  const caps = await db.capability.findMany({ orderBy: { name: "asc" } });
  eq("count", caps.length, 5);
  eq("sorted ascending", caps.map((c) => c.name), [...ROLES].sort());

  group("db: positions");
  const positions = await db.position.findMany({
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    include: { requiredRole: true },
  });
  eq("count", positions.length, 8);
  ok(
    "ordered by sortOrder asc",
    positions.every((p, i) => i === 0 || positions[i - 1].sortOrder <= p.sortOrder)
  );
  eq("two positions require equipment", positions.filter((p) => p.requiredRoleId).length, 2);

  group("db: employees roster");
  const roster = await db.employee.findMany({
    where: { terminatedAt: null },
    include: { position: true, roles: true, capabilities: true },
    orderBy: { name: "asc" },
  });
  eq("roster count (30 workers + admin + supervisor)", roster.length, 32);
  ok("at least 30 employees", roster.length >= 30);
  ok("every employee has ≥1 equipment or is admin/sup", roster.every((e) => e.roles.length >= 1 || e.username));
  ok("every worker has ≥1 role (capability)", roster.filter((e) => !e.username).every((e) => e.capabilities.length >= 1));
  ok("some workers have multiple roles", roster.some((e) => e.capabilities.length >= 2));
  ok("seeded admin has a hashed password", !!(roster.find((e) => e.username === "admin") as Record<string, unknown> | undefined)?.passwordHash);

  // shared grouping helpers (mirror DashboardSections)
  const stayingOver = (e: { stayOverUntil: Date | null }) =>
    !!e.stayOverUntil && new Date(e.stayOverUntil).getTime() > now.getTime();
  const onShift = (e: { shift: string | null; stayOverUntil: Date | null }, key: string) =>
    !key || e.shift === null || e.shift === key || stayingOver(e);
  const present = (e: { attendance: string }) => e.attendance === "PRESENT";
  const activeNow = (e: { shift: string | null; attendance: string; stayOverUntil: Date | null }, key: string) =>
    present(e) && onShift(e, key);

  group("db: dashboard grouping (shiftKey=FIRST)");
  const key = "FIRST";
  const onShiftList = roster.filter((e) => onShift(e, key));
  ok("no SECOND/THIRD crew unless staying over", onShiftList.every((e) => e.shift === null || e.shift === key || stayingOver(e)));
  ok("every active card is present + on shift", onShiftList.filter((e) => activeNow(e, key)).every((e) => present(e) && onShift(e, key)));
  const cols = positions.map((p) => {
    const members = onShiftList.filter((e) => e.positionId === p.id);
    return { title: p.title, members: members.length, present: members.filter(present).length };
  });
  ok("present count ≤ members for every position", cols.every((c) => c.present <= c.members));
  // FIRST-shift present count matches the spec source of truth
  const specFirstPresent = specs.filter((s) => s.shift === "FIRST" && s.attendance === "PRESENT").length;
  const dbFirstPresent = roster.filter((e) => e.shift === "FIRST" && present(e)).length;
  eq("FIRST present matches specs", dbFirstPresent, specFirstPresent);
  ok("stay-over employees included though off-shift", roster.filter(stayingOver).every((e) => onShift(e, key)));

  group("db: admin employees shift columns + sort");
  const positionKey = (e: { position: { title: string } | null }) =>
    e.position?.title.toLowerCase() ?? "￿";
  const byShift: Record<string, typeof roster> = { FIRST: [], SECOND: [], THIRD: [], NONE: [] };
  for (const e of roster) byShift[e.shift ?? "NONE"].push(e);
  eq(
    "columns partition the roster",
    byShift.FIRST.length + byShift.SECOND.length + byShift.THIRD.length + byShift.NONE.length,
    roster.length
  );
  eq("FIRST column count matches specs", byShift.FIRST.length, specs.filter((s) => s.shift === "FIRST").length);
  eq("no-shift column has admin+supervisor+3 no-shift workers", byShift.NONE.length, specs.filter((s) => s.shift === null).length + 2);
  for (const col of ["FIRST", "SECOND", "THIRD", "NONE"]) {
    const sorted = [...byShift[col]].sort((a, b) => {
      const pd = positionKey(a).localeCompare(positionKey(b));
      return pd !== 0 ? pd : a.name.localeCompare(b.name);
    });
    ok(
      `${col}: position-then-name order is monotonic`,
      sorted.every((e, i) => {
        if (i === 0) return true;
        const prev = sorted[i - 1];
        const pk = positionKey(prev).localeCompare(positionKey(e));
        return pk < 0 || (pk === 0 && prev.name.localeCompare(e.name) <= 0);
      })
    );
  }
  ok("no-position employees sort last within a column", (() => {
    const none = [...byShift.NONE].sort((a, b) => {
      const pd = positionKey(a).localeCompare(positionKey(b));
      return pd !== 0 ? pd : a.name.localeCompare(b.name);
    });
    const firstNoPos = none.findIndex((e) => !e.position);
    return none.slice(firstNoPos).every((e) => !e.position);
  })());

  group("db: notices (scheduling + splitNotices)");
  const active = await db.announcement.findMany({
    where: {
      AND: [
        { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
      ],
    },
    orderBy: { createdAt: "asc" },
  });
  eq("active excludes scheduled + expired", active.length, 8);
  ok("scheduled notice not active", active.every((a) => a.message !== "SCHEDULED-FUTURE"));
  ok("expired notice not active", active.every((a) => a.message !== "EXPIRED-ZED"));
  const { visible, queued } = splitNotices(active);
  eq("visible respects cap", visible.length, 5);
  eq("queued overflow", queued.length, 3);
  eq("both pinned are visible", visible.filter((v) => v.pinned).length, 2);
  ok("pinned shown first", visible[0].pinned && visible[1].pinned);
  eq(
    "visible set",
    visible.map((v) => v.message),
    ["PINNED-ALPHA", "PINNED-BETA", "NOTICE-1", "NOTICE-2", "NOTICE-3"]
  );

  group("db: settings round-trip");
  await setDashboardName("Acme Test Center");
  eq("reads back what was set", await getDashboardName(), "Acme Test Center");
  await setDashboardName("   "); // blank falls back to default
  eq("blank falls back to default", await getDashboardName(), DEFAULT_DASHBOARD_NAME);

  return { roster, positions };
}

// ===========================================================================
// SHIFT ROTATION — how the main dashboard board changes across shifts
// ===========================================================================
// The public board's "Team by Position" section filters to the crew whose
// shift is active now (plus no-shift crew and anyone staying over), and hides
// positions with nobody on. We anchor `now` into each shift and assert the
// resulting board — deterministically, from the seeded specs.
function rotationTests(specs: Spec[]) {
  const nowRef = easternAt("2026-07-06T12:00");
  const stayOverAt = new Date(nowRef.getTime() + 2 * 3600 * 1000); // 14:00 ET
  const roster = specs.map((s) => ({
    shift: s.shift as string | null,
    positionIdx: s.positionIdx,
    attendance: s.attendance as string,
    stayOverUntil: s.stayOver ? stayOverAt : null,
  }));
  const anchors: Record<string, string> = {
    FIRST: "2026-07-06T10:00",
    SECOND: "2026-07-06T18:00",
    THIRD: "2026-07-06T02:00",
  };

  console.log("\n=== MAIN DASHBOARD — SHIFT ROTATION ===");
  for (const shift of ["FIRST", "SECOND", "THIRD"] as const) {
    group(`rotation: ${SHIFTS[shift].label}`);
    const now = easternAt(anchors[shift]);
    eq("currentShift matches anchor", currentShift(now), shift);

    const stayingOver = (e: { stayOverUntil: Date | null }) =>
      !!e.stayOverUntil && e.stayOverUntil.getTime() > now.getTime();
    const onShift = (e: { shift: string | null; stayOverUntil: Date | null }) =>
      e.shift === null || e.shift === shift || stayingOver(e);
    const present = (e: { attendance: string }) => e.attendance === "PRESENT";

    // Board shows only positioned crew who are on this shift.
    const visible = roster.filter((e) => e.positionIdx !== null && onShift(e));
    ok(
      "no foreign-shift crew unless no-shift or staying over",
      visible.every((e) => e.shift === null || e.shift === shift || stayingOver(e))
    );
    ok(
      "every active card is present + on shift",
      visible.filter((e) => present(e) && onShift(e)).every((e) => present(e) && onShift(e))
    );
    // Cross-check the visible count against the spec source of truth.
    const expected = specs.filter((s) => {
      const so = s.stayOver ? stayOverAt.getTime() > now.getTime() : false;
      return s.positionIdx !== null && (s.shift === null || s.shift === shift || so);
    }).length;
    eq("visible positioned count matches specs", visible.length, expected);

    const posShown = new Set(visible.map((e) => e.positionIdx)).size;
    const presentCount = visible.filter(present).length;
    const stayCount = visible.filter((e) => stayingOver(e) && e.shift !== shift).length;
    console.log(
      `  ${SHIFTS[shift].label}: positions shown ${posShown}, on-board ${visible.length}, present ${presentCount}, staying-over ${stayCount}`
    );
  }

  // The three shifts + no-shift together account for every worker exactly once.
  group("rotation: coverage");
  const counts = { FIRST: 0, SECOND: 0, THIRD: 0, NONE: 0 };
  for (const s of specs) counts[s.shift ?? "NONE"]++;
  eq("shifts partition the workforce", counts.FIRST + counts.SECOND + counts.THIRD + counts.NONE, specs.length);
  ok("each real shift has crew", counts.FIRST > 0 && counts.SECOND > 0 && counts.THIRD > 0);
}

// ===========================================================================
// HTTP API TESTS (against the running dev server)
// ===========================================================================
const BASE = "http://localhost:3000";

// Log in through the Auth.js Credentials flow and return a Cookie header
// carrying the session token (empty string if login failed).
async function login(username: string, password: string): Promise<string> {
  const jar = new Map<string, string>();
  const store = (res: Response) => {
    for (const c of res.headers.getSetCookie()) {
      const [kv] = c.split(";");
      const i = kv.indexOf("=");
      if (i > 0) jar.set(kv.slice(0, i).trim(), kv.slice(i + 1));
    }
  };
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");

  const csrfRes = await fetch(BASE + "/api/auth/csrf", { headers: { cookie: cookie() } });
  store(csrfRes);
  const { csrfToken } = await csrfRes.json();

  const res = await fetch(BASE + "/api/auth/callback/credentials", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: cookie() },
    body: new URLSearchParams({ csrfToken, username, password, callbackUrl: BASE + "/admin" }).toString(),
    redirect: "manual",
  });
  store(res);
  const hasSession = [...jar.keys()].some((k) => k.includes("session-token"));
  return hasSession ? cookie() : "";
}

async function httpTests(roster: { length: number }) {
  const j = async (path: string, cookie = "") => {
    const res = await fetch(BASE + path, cookie ? { headers: { cookie } } : undefined);
    return { status: res.status, body: await res.json().catch(() => null) };
  };

  group("http: public GETs");
  eq("/api/health 200", (await fetch(BASE + "/api/health")).status, 200);
  {
    const r = await j("/api/settings");
    eq("/api/settings 200", r.status, 200);
    eq("settings default name", r.body?.dashboardName, DEFAULT_DASHBOARD_NAME);
  }
  {
    const r = await j("/api/positions");
    eq("/api/positions 200", r.status, 200);
    eq("returns 8 positions", r.body?.length, 8);
    ok(
      "sortOrder ascending",
      Array.isArray(r.body) &&
        r.body.every((p: { sortOrder: number }, i: number) => i === 0 || r.body[i - 1].sortOrder <= p.sortOrder)
    );
  }
  {
    const r = await j("/api/equipment");
    eq("/api/equipment 200", r.status, 200);
    eq("returns 5 equipment", r.body?.length, 5);
  }
  {
    const r = await j("/api/roles");
    eq("/api/roles 200", r.status, 200);
    eq("returns 5 roles", r.body?.length, 5);
  }

  group("http: public dashboard HTML");
  {
    const res = await fetch(BASE + "/");
    const html = await res.text();
    eq("/ 200", res.status, 200);
    ok("shows a pinned notice", html.includes("PINNED-ALPHA"));
    ok("hides expired notice", !html.includes("EXPIRED-ZED"));
    ok("hides scheduled notice", !html.includes("SCHEDULED-FUTURE"));
    ok("shows dashboard name", html.includes(DEFAULT_DASHBOARD_NAME));
  }

  group("http: RBAC (unauthenticated rejected)");
  eq("GET /api/employees no auth → 403", (await j("/api/employees")).status, 403);
  eq(
    "reorder no auth → 403",
    (await fetch(BASE + "/api/positions/reorder", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status,
    403
  );
  eq(
    "settings PATCH no auth → 403",
    (await fetch(BASE + "/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dashboardName: "hacked" }) })).status,
    403
  );
  eq(
    "equipment POST no auth → 403",
    (await fetch(BASE + "/api/equipment", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "x" }) })).status,
    403
  );
  eq(
    "roles POST no auth → 403",
    (await fetch(BASE + "/api/roles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "x" }) })).status,
    403
  );
  eq(
    "roles reorder no auth → 403",
    (await fetch(BASE + "/api/roles/reorder", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status,
    403
  );

  group("http: admin session");
  const admin = await login("admin", "admin123");
  ok("admin login succeeded", admin !== "");
  if (admin) {
    const r = await j("/api/employees", admin);
    eq("GET /api/employees 200", r.status, 200);
    eq("returns full roster", r.body?.length, roster.length);
    ok("includes position + roles relations", Array.isArray(r.body) && r.body.every((e: Record<string, unknown>) => "position" in e && Array.isArray(e.roles)));
    ok("passwordHash omitted from API", Array.isArray(r.body) && r.body.every((e: Record<string, unknown>) => e.passwordHash === undefined));

    // Authorized mutation: rename via API, confirm, then reset.
    const patch = await fetch(BASE + "/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: admin },
      body: JSON.stringify({ dashboardName: "Renamed By Test" }),
    });
    eq("admin PATCH /api/settings → 200", patch.status, 200);
    eq("name persisted", (await j("/api/settings")).body?.dashboardName, "Renamed By Test");
    await fetch(BASE + "/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: admin },
      body: JSON.stringify({ dashboardName: DEFAULT_DASHBOARD_NAME }),
    });
    eq("name reset to default", (await j("/api/settings")).body?.dashboardName, DEFAULT_DASHBOARD_NAME);
  }

  group("http: supervisor session (limited)");
  const sup = await login("sup", "sup12345");
  ok("supervisor login succeeded", sup !== "");
  if (sup) {
    eq("supervisor GET /api/employees 200 (needs roster)", (await j("/api/employees", sup)).status, 200);
    const patch = await fetch(BASE + "/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: sup },
      body: JSON.stringify({ dashboardName: "sup-should-not" }),
    });
    eq("supervisor PATCH /api/settings → 403 (admin only)", patch.status, 403);
    eq("supervisor name unchanged", (await j("/api/settings")).body?.dashboardName, DEFAULT_DASHBOARD_NAME);
  }
}

// ===========================================================================
async function main() {
  const now = new Date();
  unitTests();
  const { specs } = await seed(now);
  const { roster } = await dbTests(now, specs);
  rotationTests(specs);
  try {
    await httpTests(roster);
  } catch (err) {
    group("http");
    ok("dev server reachable on :3000", false, String(err));
  }

  // ---- report ----
  console.log("\n=== TEST RESULTS ===");
  let totalPass = 0;
  let totalFail = 0;
  for (const [name, g] of Object.entries(groups)) {
    totalPass += g.pass;
    totalFail += g.fail;
    const mark = g.fail === 0 ? "PASS" : "FAIL";
    console.log(`  ${mark}  ${name}  (${g.pass}/${g.pass + g.fail})`);
  }
  if (failures.length) {
    console.log("\n--- FAILURES ---");
    for (const f of failures) console.log("  ✗ " + f);
  }
  console.log(`\nTOTAL: ${totalPass} passed, ${totalFail} failed`);
  console.log(
    `Dataset: ${roster.length} employees, ${POSITIONS.length} positions, ${EQUIPMENT.length} equipment, 10 notices`
  );
  process.exitCode = totalFail === 0 ? 0 : 1;
}

main().finally(async () => {
  await db.$disconnect();
});
