"use client";

import { useEffect, useState } from "react";
import { atLeast, type AccessLevel } from "@/lib/access";

// Redirects users who don't meet `min` away from a page. NONE (not signed in)
// goes to the login page; anyone with some panel access lands on the admin
// dashboard. Returns null while checking, true once confirmed.
export function useAccessGuard(min: AccessLevel = "ADMIN") {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    (async () => {
      const me = await fetch("/api/me")
        .then((r) => r.json())
        .catch(() => ({ accessLevel: "NONE" }));
      if (!atLeast(me.accessLevel, min)) {
        window.location.href = me.accessLevel === "NONE" ? "/login" : "/admin";
        return;
      }
      setOk(true);
    })();
  }, [min]);
  return ok;
}

// Back-compat: admin-only pages.
export function useAdminGuard() {
  return useAccessGuard("ADMIN");
}

// Super-admin-only pages (Locations, Fleet). Non-super-admins are bounced to
// the admin dashboard; signed-out users to login. Returns null while checking.
export function useSuperAdminGuard() {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    (async () => {
      const me = await fetch("/api/me")
        .then((r) => r.json())
        .catch(() => ({ accessLevel: "NONE", isSuperAdmin: false }));
      if (!me.isSuperAdmin) {
        window.location.href = me.accessLevel === "NONE" ? "/login" : "/admin";
        return;
      }
      setOk(true);
    })();
  }, []);
  return ok;
}
