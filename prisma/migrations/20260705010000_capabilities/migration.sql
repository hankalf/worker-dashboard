-- Job functions an employee can perform (UI: "Roles"), separate from Equipment.
CREATE TABLE "Capability" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Capability_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Capability_name_key" ON "Capability"("name");

-- Implicit m2m join (Employee <-> Capability). A = Capability, B = Employee
-- (Prisma orders the columns by model name alphabetically).
CREATE TABLE "_EmployeeCapabilities" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_EmployeeCapabilities_AB_pkey" PRIMARY KEY ("A","B")
);

CREATE INDEX "_EmployeeCapabilities_B_index" ON "_EmployeeCapabilities"("B");

ALTER TABLE "_EmployeeCapabilities" ADD CONSTRAINT "_EmployeeCapabilities_A_fkey" FOREIGN KEY ("A") REFERENCES "Capability"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "_EmployeeCapabilities" ADD CONSTRAINT "_EmployeeCapabilities_B_fkey" FOREIGN KEY ("B") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
