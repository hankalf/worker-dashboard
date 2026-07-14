"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { TabItem } from "@/lib/tabs";
import { atLeast, type AccessLevel } from "@/lib/access";

function isActive(pathname: string, href: string) {
  return href === "/admin"
    ? pathname === "/admin"
    : pathname === href || pathname.startsWith(href + "/");
}

export function AdminNav({
  level,
  tabs,
  isSuperAdmin = false,
}: {
  level: AccessLevel;
  tabs: TabItem[];
  isSuperAdmin?: boolean;
}) {
  const pathname = usePathname();
  const visible = tabs.filter((t) => atLeast(level, t.minAccess));
  const topItems = visible.filter((t) => t.group === "top");
  const setupItems = visible.filter((t) => t.group === "setup");
  // Locations is super-admin-only and lives at the end of Setup.
  const setupExtras = isSuperAdmin
    ? [{ key: "locations", label: "Locations", href: "/admin/locations", description: "" }]
    : [];
  const allSetup = [...setupItems, ...setupExtras];
  const inSetup = allSetup.some((i) => isActive(pathname, i.href));
  const [open, setOpen] = useState(inSetup);

  const linkClass = (href: string) =>
    `block whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium ${
      isActive(pathname, href)
        ? "bg-zinc-800 text-white"
        : "text-zinc-300 hover:bg-zinc-800 hover:text-white"
    }`;

  return (
    <ul className="flex flex-row gap-1 overflow-x-auto md:flex-col">
      {topItems.map((item) => (
        <li key={item.key}>
          <Link
            href={item.href}
            title={item.description || undefined}
            className={linkClass(item.href)}
          >
            {item.label}
          </Link>
        </li>
      ))}

      {allSetup.length > 0 && (
        <>
          <li className="md:mt-2">
            <button
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              className="flex w-full items-center justify-between gap-1 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium text-zinc-400 hover:bg-zinc-800 hover:text-white"
            >
              Setup
              <svg
                className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`}
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 2l4 4-4 4" />
              </svg>
            </button>
          </li>
          {open &&
            allSetup.map((item) => (
              <li key={item.key}>
                <Link
                  href={item.href}
                  title={item.description || undefined}
                  className={`${linkClass(item.href)} md:ml-3`}
                >
                  {item.label}
                </Link>
              </li>
            ))}
        </>
      )}
    </ul>
  );
}
