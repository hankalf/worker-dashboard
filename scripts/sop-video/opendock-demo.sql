-- Points the demo location's Opendock integration at the local mock API and
-- turns on the dock-schedule rotation, so the recording shows the real dock
-- screen. Local dev database only — never run this against production.

INSERT INTO "LocationSetting" ("locationId", key, value)
SELECT l.id, k.key, k.value
FROM "Location" l,
     (VALUES
        ('opendock.enabled', 'true'),
        ('opendock.baseUrl', 'http://localhost:4310'),
        ('opendock.email', 'dock-service@demo.local'),
        ('opendock.password', 'demo-password'),
        ('opendock.warehouseId', 'wh-demo-0001'),
        ('opendock.windowHours', '24'),
        ('opendock.personRoles', 'receiver, loader'),
        ('opendock.fontScale', '100'),
        ('opendock.refreshSeconds', '60'),
        ('rotatingDock', 'true'),
        ('rotatingDockHidden', 'other,requested'),
        ('rotationSeconds', '25')
     ) AS k(key, value)
WHERE l.slug = 'default'
ON CONFLICT ("locationId", key) DO UPDATE SET value = EXCLUDED.value;

-- Put most of the demo roster on the shift that is running right now, so the
-- recorded board is full rather than nearly empty, and clear lunch times so the
-- "Stagger lunches" step in the video visibly does something.
UPDATE "Employee"
SET shift = CASE WHEN shift = 'FIRST' THEN 'SECOND' ELSE 'FIRST' END::"Shift"
WHERE "locationId" = (SELECT id FROM "Location" WHERE slug = 'default')
  AND shift IN ('FIRST', 'SECOND')
  AND EXTRACT(HOUR FROM now() AT TIME ZONE 'America/New_York') BETWEEN 14 AND 21;

UPDATE "Employee"
SET "lunchStart" = NULL, "lunchEnd" = NULL
WHERE "locationId" = (SELECT id FROM "Location" WHERE slug = 'default');

-- Leave a couple of gaps so "Fill open positions" has real work to propose.
UPDATE "Employee"
SET "positionId" = NULL
WHERE "locationId" = (SELECT id FROM "Location" WHERE slug = 'default')
  AND name IN ('Nina Ortega', 'Marcus Bell', 'Kayla Brennan');
