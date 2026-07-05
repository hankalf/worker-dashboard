-- Mark an employee as staying past their shift end (shows on the main dashboard
-- until this time).
ALTER TABLE "Employee" ADD COLUMN "stayOverUntil" TIMESTAMP(3);
