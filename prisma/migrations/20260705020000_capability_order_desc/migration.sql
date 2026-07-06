-- Roles (Capability) gain an optional description and a display order.
ALTER TABLE "Capability" ADD COLUMN "description" TEXT;
ALTER TABLE "Capability" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
