import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const username = process.env.SEED_ADMIN_USERNAME ?? "admin";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "admin123";
  const passwordHash = await bcrypt.hash(password, 10);

  // Ensure the default location exists (the migration creates it on existing
  // databases; this covers a brand-new dev DB seeded before any board load).
  const location = await prisma.location.upsert({
    where: { slug: "default" },
    update: {},
    create: { id: "loc_default", name: "Main Warehouse", slug: "default" },
  });

  // The bootstrap admin is always restored to a full super-admin on seed, so a
  // redeploy reliably grants panel access + location control (the recovery
  // path). SEED_ADMIN_PASSWORD additionally resets the password.
  const admin = await prisma.employee.upsert({
    where: { username },
    update: {
      accessLevel: "ADMIN",
      isSuperAdmin: true,
      ...(process.env.SEED_ADMIN_PASSWORD ? { passwordHash } : {}),
    },
    create: {
      name: "Admin",
      username,
      passwordHash,
      accessLevel: "ADMIN",
      isSuperAdmin: true,
      locationId: location.id,
    },
  });

  console.log(`Seeded admin employee: ${admin.username}`);
  if (!process.env.SEED_ADMIN_PASSWORD) {
    console.log(`Default password: ${password} (change this after first login)`);
  }

  // The built-in "superadmin" SuperUser — always present, always super, and
  // protected from deletion/demotion (see src/lib/access.ts). Its password is
  // set/reset from SUPERADMIN_PASSWORD when provided; on first creation without
  // it, a default is used and a warning printed. accessLevel + isSuperAdmin are
  // always restored so this account can never be locked out.
  const superPassword = process.env.SUPERADMIN_PASSWORD;
  const superadmin = await prisma.employee.upsert({
    where: { username: "superadmin" },
    update: {
      accessLevel: "ADMIN",
      isSuperAdmin: true,
      ...(superPassword
        ? { passwordHash: await bcrypt.hash(superPassword, 10) }
        : {}),
    },
    create: {
      name: "Super Admin",
      username: "superadmin",
      passwordHash: await bcrypt.hash(superPassword ?? "superadmin", 10),
      accessLevel: "ADMIN",
      isSuperAdmin: true,
      locationId: location.id,
    },
  });
  console.log(`Ensured superadmin account: ${superadmin.username}`);
  if (!superPassword) {
    console.warn(
      "  ⚠ SUPERADMIN_PASSWORD not set — 'superadmin' uses the default password " +
        "'superadmin' on first create. Set SUPERADMIN_PASSWORD and redeploy to secure it."
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
