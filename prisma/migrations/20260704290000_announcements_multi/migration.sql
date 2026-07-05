-- Multiple announcements: add createdAt so the board can order/queue notices.
-- (id switches to a client-generated cuid default, which needs no SQL change.)
ALTER TABLE "Announcement" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
