import type { DefaultSession } from "@auth/core/types";

type AccessLevel = "NONE" | "LEAD" | "SUPERVISOR" | "ADMIN";

declare module "@auth/core/types" {
  interface Session {
    user: {
      id: string;
      accessLevel?: AccessLevel;
    } & DefaultSession["user"];
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    accessLevel?: AccessLevel;
  }
}
