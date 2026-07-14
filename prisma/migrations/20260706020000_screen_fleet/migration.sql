-- Fleet: physical wall displays, each registered to a location. Pointing a
-- monitor at /screen/<token> renders that location's board.
CREATE TABLE "Screen" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Screen_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Screen_token_key" ON "Screen"("token");
CREATE INDEX "Screen_locationId_idx" ON "Screen"("locationId");

ALTER TABLE "Screen" ADD CONSTRAINT "Screen_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
