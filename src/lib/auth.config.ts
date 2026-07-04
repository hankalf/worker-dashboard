import type { NextAuthConfig } from "next-auth";

export const authConfig: NextAuthConfig = {
  session: { strategy: "jwt" },
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  providers: [],
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) {
        token.id = user.id as string;
        token.accessLevel = (
          user as { accessLevel?: "NONE" | "SUPERVISOR" | "ADMIN" }
        ).accessLevel;
      }
      return token;
    },
    session: async ({ session, token }) => {
      session.user.id = token.id;
      session.user.accessLevel = token.accessLevel;
      return session;
    },
  },
};
