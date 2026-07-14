-- Per-location display settings: dashboard name, branding, scroll speed,
-- rotation, and shift bounds move from the global Setting table into a
-- per-location store so each warehouse's board shows its own identity.
CREATE TABLE "LocationSetting" (
    "locationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "LocationSetting_pkey" PRIMARY KEY ("locationId", "key")
);

ALTER TABLE "LocationSetting" ADD CONSTRAINT "LocationSetting_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Carry any existing single-warehouse customizations onto the default location
-- so the board looks unchanged after the upgrade.
INSERT INTO "LocationSetting" ("locationId", "key", "value")
SELECT 'loc_default', "key", "value"
FROM "Setting"
WHERE "key" IN (
    'dashboardName', 'scrollSpeed', 'rotatingUrl', 'rotationSeconds',
    'rotatingEnabled', 'shiftFirstStart', 'shiftSecondStart', 'shiftThirdStart'
) OR "key" LIKE 'brand.%';

-- These keys are now per-location; drop them from the global table.
DELETE FROM "Setting"
WHERE "key" IN (
    'dashboardName', 'scrollSpeed', 'rotatingUrl', 'rotationSeconds',
    'rotatingEnabled', 'shiftFirstStart', 'shiftSecondStart', 'shiftThirdStart'
) OR "key" LIKE 'brand.%';
