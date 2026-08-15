-- Per-screen text size (percent), driven from the Screen Fleet tab.
ALTER TABLE "Screen" ADD COLUMN "zoom" INTEGER NOT NULL DEFAULT 100;
