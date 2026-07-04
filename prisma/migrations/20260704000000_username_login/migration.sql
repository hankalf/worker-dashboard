-- Switch admin login from email to username. Rename (not drop/recreate)
-- so existing accounts keep their login value and password.
ALTER TABLE "Employee" RENAME COLUMN "email" TO "username";
ALTER INDEX "Employee_email_key" RENAME TO "Employee_username_key";
