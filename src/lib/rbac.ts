import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Confirms the session belongs to an employee who still has admin access,
// so revoking the admin flag takes effect immediately for API mutations.
export async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const employee = await prisma.employee.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true },
  });
  if (!employee?.isAdmin) return null;

  return session;
}
