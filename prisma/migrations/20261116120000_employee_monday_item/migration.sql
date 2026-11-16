-- Links an employee to the Monday.com board row they were synced from, so a
-- rename on the board updates the person instead of creating a duplicate.
-- Nullable: everyone added by hand has no link, and the sync leaves those alone.
ALTER TABLE "Employee" ADD COLUMN "mondayItemId" TEXT;

-- One board row maps to at most one employee per location. Postgres treats
-- NULLs as distinct in a unique index, so the many hand-added employees with no
-- link do not collide with each other.
CREATE UNIQUE INDEX "Employee_locationId_mondayItemId_key"
  ON "Employee"("locationId", "mondayItemId");
