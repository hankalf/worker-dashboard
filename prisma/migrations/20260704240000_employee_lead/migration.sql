-- Mark an employee as the lead of their position
ALTER TABLE "Employee" ADD COLUMN "isLead" BOOLEAN NOT NULL DEFAULT false;
