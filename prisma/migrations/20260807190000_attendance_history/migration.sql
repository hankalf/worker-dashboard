-- Per-employee daily attendance, so absence patterns are queryable.
CREATE TABLE "AttendanceHistory" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL DEFAULT '',
    "date" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "employeeName" TEXT NOT NULL,
    "shift" TEXT,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AttendanceHistory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AttendanceHistory_date_employeeId_key" ON "AttendanceHistory"("date", "employeeId");
CREATE INDEX "AttendanceHistory_locationId_date_idx" ON "AttendanceHistory"("locationId", "date");

ALTER TABLE "AttendanceHistory" ADD CONSTRAINT "AttendanceHistory_locationId_fkey"
    FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
