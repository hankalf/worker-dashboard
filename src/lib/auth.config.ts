import type { NextAuthConfig } from "next-auth";
import { crossSiteCookieOptions } from "@/lib/embed";

// Only `options` is given for each cookie, never `name`: Auth.js deep-merges
// this over its own defaults, so it keeps deciding the names (and the
// __Secure-/__Host- prefixes it adds over HTTPS) while we add just the
// attributes that let a session survive inside an iframe. Empty when embedding
// is off, which leaves every default untouched.
const embedCookie = { options: crossSiteCookieOptions() };

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
  // Sign-in is a POST that reads the CSRF cookie and writes the session and
  // callback-url cookies, so all three need the cross-site attributes or the
  // flow breaks halfway through. The OAuth-only cookies are included so a
  // provider added later does not quietly fail the same way.
  cookies: {
    sessionToken: embedCookie,
    callbackUrl: embedCookie,
    csrfToken: embedCookie,
    pkceCodeVerifier: embedCookie,
    state: embedCookie,
    nonce: embedCookie,
    webauthnChallenge: embedCookie,
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
