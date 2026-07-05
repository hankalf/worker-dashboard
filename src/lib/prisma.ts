import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

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

function makeClient() {
  const base = new PrismaClient({
    adapter,
    omit: { employee: { passwordHash: true } },
  });

  const extended = base.$extends({
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
  // (the extension only wraps them with a retry), but $extends widens the result
  // types in a way that clashes with the app's EmployeeWithRelations/JobWithRelations
  // annotations. Cast to the plain PrismaClient type — the same type the app used
  // before this change — so callers see unchanged types while still getting the
  // retry at runtime.
  return extended as unknown as PrismaClient;
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? makeClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
