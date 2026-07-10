-- Target minimum present headcount per shift for each position (0 = no target).
ALTER TABLE "Position" ADD COLUMN "minFirst" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Position" ADD COLUMN "minSecond" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Position" ADD COLUMN "minThird" INTEGER NOT NULL DEFAULT 0;
