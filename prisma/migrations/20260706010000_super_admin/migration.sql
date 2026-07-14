-- Super-admins manage every location (switch active location, CRUD locations,
-- oversee the fleet). Existing admins on the default location are promoted to
-- super-admin so nobody is locked out after the multi-location rollout.
ALTER TABLE "Employee" ADD COLUMN "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Employee"
SET "isSuperAdmin" = true
WHERE "accessLevel" = 'ADMIN' AND "locationId" = 'loc_default';
