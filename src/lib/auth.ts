import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
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
        if (!employee?.isAdmin || !employee.passwordHash) return null;

        const isValid = await bcrypt.compare(password, employee.passwordHash);
        if (!isValid) return null;

        return {
          id: employee.id,
          name: employee.name,
        };
      },
    }),
  ],
});
