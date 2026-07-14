import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// ---- Multi-location (multi-tenant) scoping ---------------------------------
// Every operational record belongs to a Location. Rather than thread a
// locationId through ~130 query call sites (and risk one leaking across
// tenants), a Prisma client extension does it centrally: collection reads and
// bulk writes are constrained to the active location, and creates are stamped
// with it. Operations keyed by a globally-unique id (findUnique/update/delete)
// are left alone — the id already targets one row; the request layer decides
// which ids a user may act on. Setting stays global (deploy-level state), so
// it is intentionally excluded here.
const TENANT_MODELS = new Set([
  "Employee",
  "Position",
  "Role",
  "Capability",
  "Announcement",
  "NoticeLog",
  "ShiftNote",
  "HeadcountSnapshot",
  "WorkHistory",
  "LunchHistory",
  "LaborShare",
  "ScheduledAssignment",
  "Job",
  "TaskLog",
  "ActivityLog",
]);

// Operations whose `where` is a collection filter we can safely constrain to
// the active location.
const WHERE_SCOPED_OPS = new Set([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "count",
  "aggregate",
  "groupBy",
  "updateMany",
  "deleteMany",
]);

// Cookie set by the location switcher (Phase 2). Absent → the default location.
export const ACTIVE_LOCATION_COOKIE = "wd_active_location";

let cachedDefaultLocationId: string | null = null;

// The active-location cookie, if we're inside a request. `next/headers` is
// imported lazily so importing this module from a plain Node context (the seed
// script, the test suite) never pulls in the request-only runtime.
async function readCookieLocationId(): Promise<string | null> {
  try {
    const { cookies } = await import("next/headers");
    const store = await cookies();
    return store.get(ACTIVE_LOCATION_COOKIE)?.value ?? null;
  } catch {
    return null;
  }
}

// The active location for the current request: an explicit cookie selection if
// present, otherwise the oldest (default) location. Uses the un-extended base
// client so the lookup itself is never re-scoped. `null` only when the DB has
// no locations yet (a brand-new install before the seed runs).
async function resolveLocationId(base: PrismaClient): Promise<string | null> {
  const fromCookie = await readCookieLocationId();
  if (fromCookie) return fromCookie;
  if (cachedDefaultLocationId) return cachedDefaultLocationId;
  try {
    const loc = await base.location.findFirst({
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    cachedDefaultLocationId = loc?.id ?? null;
  } catch {
    cachedDefaultLocationId = null;
  }
  return cachedDefaultLocationId;
}

// Render's free Postgres (and the network in front of it) drops idle
// connections. The default pg pool does NOT validate a connection before
// handing it out, so after an idle period the next query hits a server-closed
// socket and fails with Prisma P1017 ("Server has closed the connection") —
// which crashed whichever page ran that query (every admin tab runs DB queries
// server-side, so every tab appeared to crash). Worse, an 'error' emitted on an
// idle pooled client with no listener takes down the whole Node process.
//
// Three defenses below:
//  1. keepAlive + a bounded idle timeout so sockets stay warm and stale ones
//     are recycled before the server closes them.
//  2. onPoolError / onConnectionError handlers so a background connection drop
//     is logged and the bad connection discarded instead of crashing the app.
//  3. a query-level retry (see makeClient) so the rare first query that still
//     lands on a dead connection self-heals instead of surfacing as a crash.
const adapter = new PrismaPg(
  {
    connectionString: process.env.DATABASE_URL,
    keepAlive: true,
    // Local `prisma dev` drops idle connections aggressively (PG_IDLE_TIMEOUT_MS=1);
    // in production recycle idle connections after 10s.
    idleTimeoutMillis: process.env.PG_IDLE_TIMEOUT_MS
      ? Number(process.env.PG_IDLE_TIMEOUT_MS)
      : 10_000,
    max: 5,
  },
  {
    onPoolError: (err) => console.error("[prisma] pool error:", err.message),
    onConnectionError: (err) =>
      console.error("[prisma] connection error:", err.message),
  },
);

// Errors that mean "the query never ran because the connection was gone" — safe
// to retry, since no work was committed.
const RETRYABLE_CODES = new Set(["P1017", "P1001", "P1002"]);

// The un-extended base client, captured so the tenancy resolver can run
// un-scoped lookups (e.g. the default-location query) without recursing.
let basePrisma: PrismaClient | null = null;

function makeClient() {
  const base = new PrismaClient({
    adapter,
    omit: { employee: { passwordHash: true } },
  });
  basePrisma = base as unknown as PrismaClient;

  // Inner extension: scope tenant models to the active location.
  const scoped = base.$extends({
    query: {
      async $allOperations({ model, operation, args, query }) {
        if (!model || !TENANT_MODELS.has(model)) return query(args);
        const locationId = await resolveLocationId(basePrisma!);
        // No location yet (fresh DB pre-seed) — don't block the query; the
        // NOT NULL column would reject a bad create anyway.
        if (!locationId) return query(args);

        const a: Record<string, unknown> = { ...(args as object) };
        if (WHERE_SCOPED_OPS.has(operation)) {
          a.where = a.where ? { AND: [a.where, { locationId }] } : { locationId };
        } else if (operation === "create") {
          a.data = { locationId, ...((a.data as object) ?? {}) };
        } else if (operation === "createMany") {
          const d = a.data;
          a.data = Array.isArray(d)
            ? d.map((x) => ({ locationId, ...(x as object) }))
            : { locationId, ...((d as object) ?? {}) };
        } else if (operation === "upsert") {
          // `where` is a unique key (often already location-composite); only
          // the create branch needs the stamp.
          a.create = { locationId, ...((a.create as object) ?? {}) };
        }
        // findUnique / update / delete: keyed by unique id — left untouched.
        return query(a);
      },
    },
  });

  // Outer extension: retry a query that lost its pooled connection.
  const withRetry = scoped.$extends({
    query: {
      async $allOperations({ args, query }) {
        for (let attempt = 0; ; attempt++) {
          try {
            return await query(args);
          } catch (err) {
            const code =
              err && typeof err === "object" && "code" in err
                ? (err as { code?: unknown }).code
                : undefined;
            if (
              attempt < 2 &&
              typeof code === "string" &&
              RETRYABLE_CODES.has(code)
            ) {
              // brief backoff lets the pool establish a fresh connection
              await new Promise((r) => setTimeout(r, 50 * (attempt + 1)));
              continue;
            }
            throw err;
          }
        }
      },
    },
  });

  // The extended client is runtime-identical to the base for all model queries
  // (the extensions only add location-scoping + a retry), but $extends widens
  // the result types in a way that clashes with the app's
  // EmployeeWithRelations/JobWithRelations annotations. Cast to the plain
  // PrismaClient type so callers see unchanged types.
  return withRetry as unknown as PrismaClient;
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? makeClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// The active location id for the current request (cookie selection, else the
// default location). Call sites that build a location-composite unique key
// (headcount snapshots, shift notes) need this explicitly; most code relies on
// the extension above and never touches it.
export async function getActiveLocationId(): Promise<string | null> {
  return resolveLocationId(basePrisma ?? (prisma as unknown as PrismaClient));
}
