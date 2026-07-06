-- Optional hire date and birth date ("YYYY-MM-DD") for anniversary/birthday badges.
ALTER TABLE "Employee" ADD COLUMN "hireDate" TEXT;
ALTER TABLE "Employee" ADD COLUMN "birthDate" TEXT;
