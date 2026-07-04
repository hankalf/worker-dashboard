"use client";

import { useEffect, useState } from "react";

// Redirects non-admins away from admin-only pages (supervisors land on Assign).
// Returns null while checking, true once confirmed admin.
export function useAdminGuard() {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    (async () => {
      const res = await fetch("/api/me");
      const me = await res.json().catch(() => ({ accessLevel: "NONE" }));
      if (me.accessLevel !== "ADMIN") {
        window.location.href =
          me.accessLevel === "NONE" ? "/login" : "/admin/assign";
        return;
      }
      setOk(true);
    })();
  }, []);
  return ok;
}
