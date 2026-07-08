-- Planned position assignments for upcoming dates (Eastern "YYYY-MM-DD").
CREATE TABLE "ScheduledAssignment" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "positionId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ScheduledAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ScheduledAssignment_employeeId_date_key" ON "ScheduledAssignment"("employeeId", "date");
CREATE INDEX "ScheduledAssignment_date_idx" ON "ScheduledAssignment"("date");

ALTER TABLE "ScheduledAssignment" ADD CONSTRAINT "ScheduledAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScheduledAssignment" ADD CONSTRAINT "ScheduledAssignment_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;
