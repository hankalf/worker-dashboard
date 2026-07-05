"use client";

import { useEffect } from "react";

// Global fallback so the wall display never shows a raw crash. The dashboard is
// a live view that refreshes on its own, so we retry automatically — combined
// with the DB-connection retry, transient hiccups recover without anyone
// touching the screen.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard error boundary:", error);
    const t = setTimeout(() => reset(), 5000);
    return () => clearTimeout(t);
  }, [error, reset]);

  return (
    <div className="flex min-h-[60vh] flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="text-lg font-semibold">Reconnecting…</div>
      <p className="max-w-sm text-sm text-zinc-500">
        The dashboard hit a snag and is retrying automatically.
      </p>
      <button
        onClick={() => reset()}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        Retry now
      </button>
    </div>
  );
}
