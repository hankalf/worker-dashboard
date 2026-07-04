import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// The `prisma dev` local database drops idle connections, so local dev needs
// PG_IDLE_TIMEOUT_MS=1; leave it unset in production for normal pooling.
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  idleTimeoutMillis: process.env.PG_IDLE_TIMEOUT_MS
    ? Number(process.env.PG_IDLE_TIMEOUT_MS)
    : undefined,
});

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ adapter, omit: { employee: { passwordHash: true } } });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
