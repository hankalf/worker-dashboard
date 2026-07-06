-- A position can require a role (job function / Capability) the assignee holds.
ALTER TABLE "Position" ADD COLUMN "requiredCapabilityId" TEXT;

ALTER TABLE "Position" ADD CONSTRAINT "Position_requiredCapabilityId_fkey" FOREIGN KEY ("requiredCapabilityId") REFERENCES "Capability"("id") ON DELETE SET NULL ON UPDATE CASCADE;
