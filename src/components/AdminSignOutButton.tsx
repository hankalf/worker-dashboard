"use client";

import { signOut } from "next-auth/react";

export function AdminSignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/" })}
      className="text-zinc-400 hover:text-white"
    >
      Sign out
    </button>
  );
}
