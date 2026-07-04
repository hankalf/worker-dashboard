-- Display order for positions on the main dashboard
ALTER TABLE "Position" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
