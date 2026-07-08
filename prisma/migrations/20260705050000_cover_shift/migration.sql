-- Mark an employee as covering the current shift (came in early from another
-- shift); shows on the board until this time.
ALTER TABLE "Employee" ADD COLUMN "coverUntil" TIMESTAMP(3);
