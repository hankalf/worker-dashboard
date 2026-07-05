"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const TOP_ITEMS = [
  { href: "/admin", label: "Admin Dashboard", adminOnly: false },
  { href: "/admin/assign", label: "Assign", adminOnly: false },
  { href: "/admin/jobs", label: "Side Tasks", adminOnly: false },
  { href: "/admin/attendance", label: "Attendance", adminOnly: true },
];

const SETUP_ITEMS = [
  { href: "/admin/employees", label: "Employees", adminOnly: true },
  { href: "/admin/positions", label: "Positions", adminOnly: true },
  { href: "/admin/equipment", label: "Equipment", adminOnly: true },
  { href: "/admin/activity", label: "Activity", adminOnly: true },
];

function isActive(pathname: string, href: string) {
  return href === "/admin"
    ? pathname === "/admin"
    : pathname === href || pathname.startsWith(href + "/");
}

export function AdminNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const topItems = TOP_ITEMS.filter((i) => isAdmin || !i.adminOnly);
  const setupItems = SETUP_ITEMS.filter((i) => isAdmin || !i.adminOnly);
  const inSetup = setupItems.some((i) => isActive(pathname, i.href));
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
        <li key={item.href}>
          <Link href={item.href} className={linkClass(item.href)}>
            {item.label}
          </Link>
        </li>
      ))}

      {setupItems.length > 0 && (
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
            setupItems.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
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
