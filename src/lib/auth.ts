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
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        const employee = await prisma.employee.findUnique({
          where: { email },
          omit: { passwordHash: false },
        });
        if (!employee?.isAdmin || !employee.passwordHash) return null;

        const isValid = await bcrypt.compare(password, employee.passwordHash);
        if (!isValid) return null;

        return {
          id: employee.id,
          name: employee.name,
          email: employee.email,
        };
      },
    }),
  ],
});
