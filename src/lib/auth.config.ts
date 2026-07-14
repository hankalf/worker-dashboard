import type { NextAuthConfig } from "next-auth";

export const authConfig: NextAuthConfig = {
  session: { strategy: "jwt" },
  trustHost: true,
  // Read the session-signing secret explicitly so either the Auth.js v5 name
  // (AUTH_SECRET) or the v4 name (NEXTAUTH_SECRET) works. Without this, a
  // NEXTAUTH_SECRET-only environment surfaces the Auth.js "Configuration" error
  // at sign-in. Shared by the app and the middleware.
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
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
