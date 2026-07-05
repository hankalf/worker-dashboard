-- Pinned notices stay on the board regardless of the 5-at-a-time cap / queue.
ALTER TABLE "Announcement" ADD COLUMN "pinned" BOOLEAN NOT NULL DEFAULT false;

-- One handoff note per shift (id = FIRST | SECOND | THIRD).
CREATE TABLE "ShiftNote" (
    "id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "updatedByName" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ShiftNote_pkey" PRIMARY KEY ("id")
);

-- Daily per-shift headcount snapshots for attendance history.
CREATE TABLE "HeadcountSnapshot" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "shift" TEXT NOT NULL,
    "present" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HeadcountSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "HeadcountSnapshot_date_shift_key" ON "HeadcountSnapshot"("date", "shift");
CREATE INDEX "HeadcountSnapshot_date_idx" ON "HeadcountSnapshot"("date");
