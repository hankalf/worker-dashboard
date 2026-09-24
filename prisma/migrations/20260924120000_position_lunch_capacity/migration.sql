-- How many people in a position may be at lunch at once. DEFAULT 1 applies to
-- every existing row, so current positions start at one-out-at-a-time without
-- a backfill. NOT NULL with a default is a metadata-only change in Postgres 11+
-- (no table rewrite), so this is safe on a live table.
ALTER TABLE "Position" ADD COLUMN "lunchCapacity" INTEGER NOT NULL DEFAULT 1;
