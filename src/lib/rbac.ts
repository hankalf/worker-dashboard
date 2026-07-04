import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Re-reads the live access level so changes take effect immediately, rather
// than trusting a possibly-stale session token.
async function levelOf(userId: string) {
  const employee = await prisma.employee.findUnique({
    where: { id: userId },
    select: { accessLevel: true },
  });
  return employee?.accessLevel ?? "NONE";
}

// Full admin only.
export async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) return null;
  if ((await levelOf(session.user.id)) !== "ADMIN") return null;
  return session;
}

// Admin or supervisor (anyone with panel access). Returns the session plus the
// resolved level so handlers can further restrict fields for supervisors.
export async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const level = await levelOf(session.user.id);
  if (level === "NONE") return null;
  return { session, level, isAdmin: level === "ADMIN" };
}
