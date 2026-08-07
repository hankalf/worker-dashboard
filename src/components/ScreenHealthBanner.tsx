import Link from "next/link";
import { prisma } from "@/lib/prisma";

// A screen that hasn't polled in this long is treated as down. The heartbeat
// runs every 15s, so an hour of silence is unambiguous — not a slow network or
// a browser throttling a background tab.
const OFFLINE_AFTER_MS = 60 * 60_000;

function since(from: Date, now: Date): string {
  const mins = Math.round((now.getTime() - from.getTime()) / 60_000);
  if (mins < 90) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  return hrs < 48 ? `${hrs}h` : `${Math.round(hrs / 24)}d`;
}

// Flags registered wall displays that have gone quiet. The Fleet tab already
// shows last-seen per screen, but nobody watches that page — this surfaces a
// dark display where an admin will actually see it.
export async function ScreenHealthBanner() {
  const now = new Date();
  const screens = await prisma.screen.findMany({
    include: { location: { select: { name: true } } },
    orderBy: { name: "asc" },
  });

  const down = screens.filter(
    (s) => !s.lastSeenAt || now.getTime() - s.lastSeenAt.getTime() > OFFLINE_AFTER_MS
  );
  if (down.length === 0) return null;

  return (
    <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-medium text-amber-200">
          {down.length === 1 ? "1 screen is offline" : `${down.length} screens are offline`}
        </h3>
        <Link
          href="/admin/fleet"
          className="text-sm text-amber-300 underline hover:text-amber-200"
        >
          Screen Fleet
        </Link>
      </div>
      <ul className="mt-2 flex flex-col gap-1 text-sm text-amber-100/90">
        {down.slice(0, 8).map((s) => (
          <li key={s.id}>
            <span className="font-medium">{s.name}</span>
            <span className="text-amber-200/70"> · {s.location.name} · </span>
            {s.lastSeenAt ? `last seen ${since(s.lastSeenAt, now)} ago` : "never opened"}
          </li>
        ))}
        {down.length > 8 && (
          <li className="text-amber-200/70">and {down.length - 8} more</li>
        )}
      </ul>
    </div>
  );
}
