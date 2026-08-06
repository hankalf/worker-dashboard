"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Wraps the admin tab content. When a super-admin with more than one location
// hasn't picked a dashboard this session, every tab except the Master Dashboard
// (/admin) is replaced with a prompt to choose one — a safety net for anyone who
// navigates by URL, since the nav already hides those tabs until a selection is
// made. Nothing silently edits the last location.
export function DashboardGate({
  needsSelection,
  children,
}: {
  needsSelection: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  if (needsSelection && pathname !== "/admin") {
    return (
      <div className="mx-auto max-w-md rounded-lg border border-zinc-800 bg-zinc-900 p-6 text-center">
        <h2 className="text-lg font-semibold text-white">No dashboard selected</h2>
        <p className="mt-2 text-sm text-zinc-400">
          Pick a dashboard from the Master Dashboard to manage its employees,
          notices, settings and more. Everything you change here applies to the
          dashboard you select.
        </p>
        <Link
          href="/admin"
          className="mt-4 inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
        >
          Go to Master Dashboard
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
