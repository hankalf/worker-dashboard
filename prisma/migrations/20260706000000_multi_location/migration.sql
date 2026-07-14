-- Multi-location (multi-tenant) support: every operational record now belongs
-- to a Location. This migration creates a default location and backfills all
-- existing rows to it, so an existing single-warehouse deployment keeps working
-- unchanged (everything lands under "Main Warehouse").

-- 1. Location table -----------------------------------------------------------
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Location_slug_key" ON "Location"("slug");

-- The default location that all pre-existing data is migrated onto.
INSERT INTO "Location" ("id", "name", "slug", "createdAt")
VALUES ('loc_default', 'Main Warehouse', 'default', CURRENT_TIMESTAMP);

-- 2. Add locationId to every tenant table, backfill, enforce, link -----------
-- Employee
ALTER TABLE "Employee" ADD COLUMN "locationId" TEXT;
UPDATE "Employee" SET "locationId" = 'loc_default';
ALTER TABLE "Employee" ALTER COLUMN "locationId" SET NOT NULL;
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Position (title is now unique per-location instead of globally)
ALTER TABLE "Position" ADD COLUMN "locationId" TEXT;
UPDATE "Position" SET "locationId" = 'loc_default';
ALTER TABLE "Position" ALTER COLUMN "locationId" SET NOT NULL;
ALTER TABLE "Position" ADD CONSTRAINT "Position_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
DROP INDEX "Position_title_key";
CREATE UNIQUE INDEX "Position_locationId_title_key" ON "Position"("locationId", "title");

-- Role (Equipment in the UI; name is now unique per-location)
ALTER TABLE "Role" ADD COLUMN "locationId" TEXT;
UPDATE "Role" SET "locationId" = 'loc_default';
ALTER TABLE "Role" ALTER COLUMN "locationId" SET NOT NULL;
ALTER TABLE "Role" ADD CONSTRAINT "Role_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
DROP INDEX "Role_name_key";
CREATE UNIQUE INDEX "Role_locationId_name_key" ON "Role"("locationId", "name");

-- Capability (Roles in the UI; name is now unique per-location)
ALTER TABLE "Capability" ADD COLUMN "locationId" TEXT;
UPDATE "Capability" SET "locationId" = 'loc_default';
ALTER TABLE "Capability" ALTER COLUMN "locationId" SET NOT NULL;
ALTER TABLE "Capability" ADD CONSTRAINT "Capability_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
DROP INDEX "Capability_name_key";
CREATE UNIQUE INDEX "Capability_locationId_name_key" ON "Capability"("locationId", "name");

-- Announcement
ALTER TABLE "Announcement" ADD COLUMN "locationId" TEXT;
UPDATE "Announcement" SET "locationId" = 'loc_default';
ALTER TABLE "Announcement" ALTER COLUMN "locationId" SET NOT NULL;
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- NoticeLog
ALTER TABLE "NoticeLog" ADD COLUMN "locationId" TEXT;
UPDATE "NoticeLog" SET "locationId" = 'loc_default';
ALTER TABLE "NoticeLog" ALTER COLUMN "locationId" SET NOT NULL;
ALTER TABLE "NoticeLog" ADD CONSTRAINT "NoticeLog_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
DROP INDEX "NoticeLog_createdAt_idx";
CREATE INDEX "NoticeLog_locationId_createdAt_idx" ON "NoticeLog"("locationId", "createdAt");

-- ShiftNote: was keyed by shift alone (id = FIRST|SECOND|THIRD); now keyed by
-- (locationId, shift). Rename the old id column to shift and rebuild the PK.
ALTER TABLE "ShiftNote" ADD COLUMN "locationId" TEXT;
UPDATE "ShiftNote" SET "locationId" = 'loc_default';
ALTER TABLE "ShiftNote" ALTER COLUMN "locationId" SET NOT NULL;
ALTER TABLE "ShiftNote" DROP CONSTRAINT "ShiftNote_pkey";
ALTER TABLE "ShiftNote" RENAME COLUMN "id" TO "shift";
ALTER TABLE "ShiftNote" ADD CONSTRAINT "ShiftNote_pkey" PRIMARY KEY ("locationId", "shift");
ALTER TABLE "ShiftNote" ADD CONSTRAINT "ShiftNote_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- HeadcountSnapshot (unique + index now scoped by location)
ALTER TABLE "HeadcountSnapshot" ADD COLUMN "locationId" TEXT;
UPDATE "HeadcountSnapshot" SET "locationId" = 'loc_default';
ALTER TABLE "HeadcountSnapshot" ALTER COLUMN "locationId" SET NOT NULL;
ALTER TABLE "HeadcountSnapshot" ADD CONSTRAINT "HeadcountSnapshot_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
DROP INDEX "HeadcountSnapshot_date_shift_key";
DROP INDEX "HeadcountSnapshot_date_idx";
CREATE UNIQUE INDEX "HeadcountSnapshot_locationId_date_shift_key" ON "HeadcountSnapshot"("locationId", "date", "shift");
CREATE INDEX "HeadcountSnapshot_locationId_date_idx" ON "HeadcountSnapshot"("locationId", "date");

-- WorkHistory (employeeId already scopes the unique; add location for filtering)
ALTER TABLE "WorkHistory" ADD COLUMN "locationId" TEXT;
UPDATE "WorkHistory" SET "locationId" = 'loc_default';
ALTER TABLE "WorkHistory" ALTER COLUMN "locationId" SET NOT NULL;
ALTER TABLE "WorkHistory" ADD CONSTRAINT "WorkHistory_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
DROP INDEX "WorkHistory_createdAt_idx";
CREATE INDEX "WorkHistory_locationId_createdAt_idx" ON "WorkHistory"("locationId", "createdAt");

-- LunchHistory
ALTER TABLE "LunchHistory" ADD COLUMN "locationId" TEXT;
UPDATE "LunchHistory" SET "locationId" = 'loc_default';
ALTER TABLE "LunchHistory" ALTER COLUMN "locationId" SET NOT NULL;
ALTER TABLE "LunchHistory" ADD CONSTRAINT "LunchHistory_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
DROP INDEX "LunchHistory_date_idx";
CREATE INDEX "LunchHistory_locationId_date_idx" ON "LunchHistory"("locationId", "date");

-- LaborShare
ALTER TABLE "LaborShare" ADD COLUMN "locationId" TEXT;
UPDATE "LaborShare" SET "locationId" = 'loc_default';
ALTER TABLE "LaborShare" ALTER COLUMN "locationId" SET NOT NULL;
ALTER TABLE "LaborShare" ADD CONSTRAINT "LaborShare_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ScheduledAssignment
ALTER TABLE "ScheduledAssignment" ADD COLUMN "locationId" TEXT;
UPDATE "ScheduledAssignment" SET "locationId" = 'loc_default';
ALTER TABLE "ScheduledAssignment" ALTER COLUMN "locationId" SET NOT NULL;
ALTER TABLE "ScheduledAssignment" ADD CONSTRAINT "ScheduledAssignment_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
DROP INDEX "ScheduledAssignment_date_idx";
CREATE INDEX "ScheduledAssignment_locationId_date_idx" ON "ScheduledAssignment"("locationId", "date");

-- Job
ALTER TABLE "Job" ADD COLUMN "locationId" TEXT;
UPDATE "Job" SET "locationId" = 'loc_default';
ALTER TABLE "Job" ALTER COLUMN "locationId" SET NOT NULL;
ALTER TABLE "Job" ADD CONSTRAINT "Job_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- TaskLog
ALTER TABLE "TaskLog" ADD COLUMN "locationId" TEXT;
UPDATE "TaskLog" SET "locationId" = 'loc_default';
ALTER TABLE "TaskLog" ALTER COLUMN "locationId" SET NOT NULL;
ALTER TABLE "TaskLog" ADD CONSTRAINT "TaskLog_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
DROP INDEX "TaskLog_createdAt_idx";
CREATE INDEX "TaskLog_locationId_createdAt_idx" ON "TaskLog"("locationId", "createdAt");

-- ActivityLog
ALTER TABLE "ActivityLog" ADD COLUMN "locationId" TEXT;
UPDATE "ActivityLog" SET "locationId" = 'loc_default';
ALTER TABLE "ActivityLog" ALTER COLUMN "locationId" SET NOT NULL;
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
DROP INDEX "ActivityLog_createdAt_idx";
CREATE INDEX "ActivityLog_locationId_createdAt_idx" ON "ActivityLog"("locationId", "createdAt");

-- 3. Empty-string default on every locationId ---------------------------------
-- The app never relies on this value (a Prisma extension stamps the real
-- location on writes); it exists only so `locationId` is optional in Prisma's
-- generated create inputs. The foreign key rejects the empty sentinel, so any
-- write that somehow bypassed the extension fails loudly instead of mis-scoping.
ALTER TABLE "Employee" ALTER COLUMN "locationId" SET DEFAULT '';
ALTER TABLE "Position" ALTER COLUMN "locationId" SET DEFAULT '';
ALTER TABLE "Role" ALTER COLUMN "locationId" SET DEFAULT '';
ALTER TABLE "Capability" ALTER COLUMN "locationId" SET DEFAULT '';
ALTER TABLE "Announcement" ALTER COLUMN "locationId" SET DEFAULT '';
ALTER TABLE "NoticeLog" ALTER COLUMN "locationId" SET DEFAULT '';
ALTER TABLE "ShiftNote" ALTER COLUMN "locationId" SET DEFAULT '';
ALTER TABLE "HeadcountSnapshot" ALTER COLUMN "locationId" SET DEFAULT '';
ALTER TABLE "WorkHistory" ALTER COLUMN "locationId" SET DEFAULT '';
ALTER TABLE "LunchHistory" ALTER COLUMN "locationId" SET DEFAULT '';
ALTER TABLE "LaborShare" ALTER COLUMN "locationId" SET DEFAULT '';
ALTER TABLE "ScheduledAssignment" ALTER COLUMN "locationId" SET DEFAULT '';
ALTER TABLE "Job" ALTER COLUMN "locationId" SET DEFAULT '';
ALTER TABLE "TaskLog" ALTER COLUMN "locationId" SET DEFAULT '';
ALTER TABLE "ActivityLog" ALTER COLUMN "locationId" SET DEFAULT '';
