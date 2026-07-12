-- Preplanned events: notices scheduled far in advance, managed separately.
ALTER TABLE "Announcement" ADD COLUMN "isEvent" BOOLEAN NOT NULL DEFAULT false;
