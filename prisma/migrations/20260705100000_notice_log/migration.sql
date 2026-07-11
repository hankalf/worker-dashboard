-- Append-only log of posted notices (survives deletion) with who posted them.
CREATE TABLE "NoticeLog" (
    "id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "postedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NoticeLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "NoticeLog_createdAt_idx" ON "NoticeLog"("createdAt");
