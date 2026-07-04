-- Terminate/archive employees and preserve their logs
ALTER TABLE "Employee" ADD COLUMN "terminatedAt" TIMESTAMP(3);
ALTER TABLE "ActivityLog" ADD COLUMN "archived" BOOLEAN NOT NULL DEFAULT false;
