"use client";

import { signOut } from "next-auth/react";

export function AdminSignOutButton() {
  // Clear the session without letting Auth.js compute the redirect URL (behind
  // Render's proxy that resolves to the internal localhost:10000), then navigate
  // to the dashboard using the browser's real origin.
  const handleSignOut = async () => {
    await signOut({ redirect: false });
    window.location.href = "/";
  };

  return (
    <button
      onClick={handleSignOut}
      className="text-zinc-400 hover:text-white"
    >
      Sign out
    </button>
  );
}
