-- Activity log for side tasks
CREATE TABLE "TaskLog" (
    "id" TEXT NOT NULL,
    "jobId" TEXT,
    "jobTitle" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TaskLog_createdAt_idx" ON "TaskLog"("createdAt");
