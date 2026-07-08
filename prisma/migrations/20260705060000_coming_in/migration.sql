-- The time an employee is coming in early (drives the "In at ..." badge;
-- coverUntil remains the until-when visibility window).
ALTER TABLE "Employee" ADD COLUMN "comingInAt" TIMESTAMP(3);
