-- Attendance status, required role per position, and pinned announcement
CREATE TYPE "Attendance" AS ENUM ('PRESENT', 'ABSENT', 'CALLED_OUT');

ALTER TABLE "Employee" ADD COLUMN "attendance" "Attendance" NOT NULL DEFAULT 'PRESENT';

ALTER TABLE "Position" ADD COLUMN "requiredRoleId" TEXT;
ALTER TABLE "Position" ADD CONSTRAINT "Position_requiredRoleId_fkey"
  FOREIGN KEY ("requiredRoleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);
