-- CreateTable
CREATE TABLE "LunchHistory" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "employeeName" TEXT NOT NULL,
    "lunchStart" TEXT NOT NULL,
    "shift" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LunchHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LunchHistory_createdAt_idx" ON "LunchHistory"("createdAt");

-- CreateIndex
CREATE INDEX "LunchHistory_date_idx" ON "LunchHistory"("date");

-- CreateIndex
CREATE UNIQUE INDEX "LunchHistory_date_employeeId_key" ON "LunchHistory"("date", "employeeId");
