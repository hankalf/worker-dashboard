import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma, hasAnySuperAdmin } from "@/lib/prisma";
import { authConfig } from "@/lib/auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const username = credentials?.username as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!username || !password) return null;

        const employee = await prisma.employee.findUnique({
          where: { username },
          omit: { passwordHash: false },
        });
        if (
          !employee ||
          employee.accessLevel === "NONE" ||
          !employee.passwordHash
        )
          return null;

        const isValid = await bcrypt.compare(password, employee.passwordHash);
        if (!isValid) return null;

        // First-admin bootstrap: if the deployment has no super-admin yet, the
        // first admin to sign in becomes it — so multi-location management is
        // never locked out by a missed seed/migration promotion. Persisted, so
        // it survives the session and the switcher works immediately.
        let isSuperAdmin = employee.isSuperAdmin;
        if (
          !isSuperAdmin &&
          employee.accessLevel === "ADMIN" &&
          !(await hasAnySuperAdmin())
        ) {
          await prisma.employee.update({
            where: { id: employee.id },
            data: { isSuperAdmin: true },
          });
          isSuperAdmin = true;
        }

        return {
          id: employee.id,
          name: employee.name,
          accessLevel: employee.accessLevel,
          isSuperAdmin,
          locationId: employee.locationId,
        };
      },
    }),
  ],
});
