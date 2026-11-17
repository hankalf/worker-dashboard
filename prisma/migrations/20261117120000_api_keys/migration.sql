-- Machine credentials for the v1 API, so an outside app can drive a location
-- without a human session. Only a SHA-256 hash of the key is stored; the
-- plaintext is shown once at creation.
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "scopes" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- The prefix is how a presented key is found before its hash is compared, so
-- it has to be unique and indexed.
CREATE UNIQUE INDEX "ApiKey_prefix_key" ON "ApiKey"("prefix");
CREATE INDEX "ApiKey_locationId_idx" ON "ApiKey"("locationId");

ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
