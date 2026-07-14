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
        const u = user as {
          accessLevel?: "NONE" | "LEAD" | "SUPERVISOR" | "ADMIN";
          isSuperAdmin?: boolean;
          locationId?: string;
        };
        token.accessLevel = u.accessLevel;
        token.isSuperAdmin = !!u.isSuperAdmin;
        token.locationId = u.locationId;
      }
      return token;
    },
    session: async ({ session, token }) => {
      session.user.id = token.id;
      session.user.accessLevel = token.accessLevel;
      session.user.isSuperAdmin = token.isSuperAdmin;
      session.user.locationId = token.locationId;
      return session;
    },
  },
};
