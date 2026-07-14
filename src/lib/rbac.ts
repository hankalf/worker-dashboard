import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { atLeast } from "@/lib/access";

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

// Anyone with panel access (LEAD, SUPERVISOR, or ADMIN). Returns the session
// plus the resolved level + super-user flag so handlers can further restrict
// fields (e.g. only a SuperUser may grant SuperUser).
export async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const emp = await prisma.employee.findUnique({
    where: { id: session.user.id },
    select: { accessLevel: true, isSuperAdmin: true },
  });
  const level = emp?.accessLevel ?? "NONE";
  if (level === "NONE") return null;
  return {
    session,
    level,
    isAdmin: level === "ADMIN",
    isSuperAdmin: !!emp?.isSuperAdmin,
  };
}

// Super-admin only (manage locations, switch active location, fleet). Re-reads
// the live flag so a demotion takes effect immediately.
export async function requireSuperAdmin() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const emp = await prisma.employee.findUnique({
    where: { id: session.user.id },
    select: { accessLevel: true, isSuperAdmin: true },
  });
  if (emp?.accessLevel !== "ADMIN" || !emp.isSuperAdmin) return null;
  return session;
}

// Supervisor or admin (for Side Tasks + Attendance, above the Lead level).
export async function requireSupervisor() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const level = await levelOf(session.user.id);
  if (!atLeast(level, "SUPERVISOR")) return null;
  return { session, level, isAdmin: level === "ADMIN" };
}
