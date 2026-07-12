-- Reset the admin build-version counter back to V2. Clearing these settings
-- makes getBuildVersion() re-pin at START (V2) on the next deploy, after which
-- it counts up again normally on each new deploy.
DELETE FROM "Setting" WHERE "key" IN ('buildNumber', 'buildCommit');
