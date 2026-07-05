-- Record who made each logged change
ALTER TABLE "ActivityLog" ADD COLUMN "actorId" TEXT;
ALTER TABLE "ActivityLog" ADD COLUMN "actorName" TEXT;
