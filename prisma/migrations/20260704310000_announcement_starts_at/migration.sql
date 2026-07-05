-- Optional scheduled start for a notice: hidden from the board until this time.
ALTER TABLE "Announcement" ADD COLUMN "startsAt" TIMESTAMP(3);
