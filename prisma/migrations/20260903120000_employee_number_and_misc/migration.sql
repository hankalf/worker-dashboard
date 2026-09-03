-- Employee number plus two admin-only misc fields. All nullable, so existing
-- rows need no backfill. These three are deliberately kept off the public
-- board (see src/lib/boardData.ts).
ALTER TABLE "Employee" ADD COLUMN "employeeNumber" TEXT;
ALTER TABLE "Employee" ADD COLUMN "misc1" TEXT;
ALTER TABLE "Employee" ADD COLUMN "misc2" TEXT;
