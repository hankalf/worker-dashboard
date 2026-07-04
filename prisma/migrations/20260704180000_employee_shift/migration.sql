-- Per-employee work shift
CREATE TYPE "Shift" AS ENUM ('FIRST', 'SECOND', 'THIRD');
ALTER TABLE "Employee" ADD COLUMN "shift" "Shift";
