-- Per-day record of which position each employee worked (for the log export).
CREATE TABLE "WorkHistory" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "employeeName" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "positionTitle" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkHistory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WorkHistory_date_employeeId_positionId_key" ON "WorkHistory"("date", "employeeId", "positionId");
CREATE INDEX "WorkHistory_createdAt_idx" ON "WorkHistory"("createdAt");
