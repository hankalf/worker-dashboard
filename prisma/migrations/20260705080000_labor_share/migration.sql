-- Temporary "labor share" workers borrowed for a shift (auto-purged after endsAt).
CREATE TABLE "LaborShare" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shift" "Shift" NOT NULL,
    "positionId" TEXT,
    "comingInAt" TIMESTAMP(3),
    "leavingAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3) NOT NULL,
    "date" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LaborShare_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LaborShare_endsAt_idx" ON "LaborShare"("endsAt");

ALTER TABLE "LaborShare" ADD CONSTRAINT "LaborShare_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;
