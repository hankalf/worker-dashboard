-- Per-screen display theme, driven from the Screen Fleet tab.
ALTER TABLE "Screen" ADD COLUMN "theme" TEXT NOT NULL DEFAULT 'light';
