-- Per-employee lunch window (time-of-day as "HH:MM" strings)
ALTER TABLE "Employee" ADD COLUMN "lunchStart" TEXT;
ALTER TABLE "Employee" ADD COLUMN "lunchEnd" TEXT;
