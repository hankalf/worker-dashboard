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

  // When SEED_ADMIN_PASSWORD is set we also reset an existing admin's password
  // and restore ADMIN access — this is the account-recovery path (set the env
  // var and redeploy to regain access if a password is lost).
  const admin = await prisma.employee.upsert({
    where: { username },
    update: process.env.SEED_ADMIN_PASSWORD
      ? { passwordHash, accessLevel: "ADMIN" }
      : {},
    create: {
      name: "Admin",
      username,
      passwordHash,
      accessLevel: "ADMIN",
      locationId: location.id,
    },
  });

  console.log(`Seeded admin employee: ${admin.username}`);
  if (!process.env.SEED_ADMIN_PASSWORD) {
    console.log(`Default password: ${password} (change this after first login)`);
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
