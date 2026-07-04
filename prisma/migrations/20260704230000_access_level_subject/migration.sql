-- Access levels (replaces isAdmin) and per-subject activity linking
CREATE TYPE "AccessLevel" AS ENUM ('NONE', 'SUPERVISOR', 'ADMIN');

ALTER TABLE "Employee" ADD COLUMN "accessLevel" "AccessLevel" NOT NULL DEFAULT 'NONE';
UPDATE "Employee" SET "accessLevel" = 'ADMIN' WHERE "isAdmin" = true;
ALTER TABLE "Employee" DROP COLUMN "isAdmin";

ALTER TABLE "ActivityLog" ADD COLUMN "subjectId" TEXT;
CREATE INDEX "ActivityLog_subjectId_idx" ON "ActivityLog"("subjectId");
