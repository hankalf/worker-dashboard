-- Short break time per employee, and optional auto-expiry for announcements
ALTER TABLE "Employee" ADD COLUMN "breakStart" TEXT;
ALTER TABLE "Announcement" ADD COLUMN "expiresAt" TIMESTAMP(3);
