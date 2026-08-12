"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { APP_TZ } from "@/lib/time";

// How often to check we can still reach the server.
const PING_MS = 10_000;
// A single missed ping is usually a blip (a slow render, a Wi-Fi roam). Only
// call it an outage after this many in a row, so the banner doesn't flicker.
const FAILURES_BEFORE_OFFLINE = 2;
// A hung request is an outage too — don't wait for the browser's own timeout.
const PING_TIMEOUT_MS = 5_000;

export type ConnectionStatus = {
  online: boolean;
  /** When we last successfully reached the server. */
  lastSeen: Date | null;
};

// Watches the link to the server, not just the network interface:
// navigator.onLine only knows whether there is *a* network, so a dead uplink,
// a down server or a broken DNS all still report "online". The ping is what
// actually tells us the board's data can be refreshed.
export function useConnectionStatus(): ConnectionStatus {
  const router = useRouter();
  const [online, setOnline] = useState(true);
  const [lastSeen, setLastSeen] = useState<Date | null>(null);
  const failures = useRef(0);
  // Lets the poll below read the current status without depending on it, so the
  // timer is never torn down and rebuilt just because the status changed.
  const onlineRef = useRef(true);
  useEffect(() => {
    onlineRef.current = online;
  }, [online]);

  useEffect(() => {
    let cancelled = false;

    const markUp = () => {
      failures.current = 0;
      setLastSeen(new Date());
      if (!onlineRef.current) {
        setOnline(true);
        // Back after an outage — pull fresh data immediately rather than
        // waiting for the next scheduled refresh.
        router.refresh();
      }
    };

    const markDown = () => {
      failures.current += 1;
      if (failures.current >= FAILURES_BEFORE_OFFLINE) setOnline(false);
    };

    const ping = async () => {
      // The browser is certain there is no network — believe it straight away.
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        failures.current = FAILURES_BEFORE_OFFLINE;
        setOnline(false);
        return;
      }
      try {
        const res = await fetch("/api/health", {
          cache: "no-store",
          // Old signage browsers may not have AbortSignal.timeout; going
          // without it just means a hung request waits for the browser's own
          // timeout, which is far better than reporting a false outage.
          signal:
            typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
              ? AbortSignal.timeout(PING_TIMEOUT_MS)
              : undefined,
        });
        if (cancelled) return;
        if (res.ok) markUp();
        else markDown();
      } catch {
        if (!cancelled) markDown();
      }
    };

    ping();
    const id = setInterval(ping, PING_MS);
    // The browser's own events get us there faster than the next poll would.
    const onOffline = () => {
      failures.current = FAILURES_BEFORE_OFFLINE;
      setOnline(false);
    };
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", ping);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", ping);
    };
  }, [router]);

  return { online, lastSeen };
}

// The outage banner: a flashing strip across the very top of the board. The
// board underneath keeps running on its last good data — the clock ticks, the
// panels rotate, the sections scroll — so the floor still has something to read
// while the network is being fixed.
export function OfflineBanner({ lastSeen }: { lastSeen: Date | null }) {
  return (
    <div
      role="alert"
      className="sop-offline flex shrink-0 items-center justify-center gap-4 px-6 py-2 text-white"
    >
      <span className="text-xl font-extrabold uppercase tracking-[0.2em]">
        No internet
      </span>
      <span className="text-sm font-medium text-red-50/90">
        {lastSeen
          ? // Same clock as the board's own header — a screen set to another
            // timezone must not print a time the floor can't reconcile.
            `Showing the board as of ${lastSeen.toLocaleTimeString(undefined, {
              hour: "numeric",
              minute: "2-digit",
              timeZone: APP_TZ,
            })} — it will update by itself when the connection is back.`
          : "Can't reach the dashboard server — the board will update by itself when the connection is back."}
      </span>
    </div>
  );
}
