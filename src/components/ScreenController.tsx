"use client";

import { useEffect, useState } from "react";

// Runs on every live screen (/screen/[token]). Sends a heartbeat every 15s so
// the Fleet tab shows it online, and acts on any command the server returns:
//  - refresh:  reload the board now
//  - identify: flash this screen's name so you can find the physical display
//  - message:  show a pushed full-screen note
type Overlay =
  | { kind: "identify"; name: string }
  | { kind: "message"; text: string }
  | null;

const POLL_MS = 15000;
const IDENTIFY_MS = 6000;
const MESSAGE_MS = 60000;

export function ScreenController({ token, name }: { token: string; name: string }) {
  const [overlay, setOverlay] = useState<Overlay>(null);

  useEffect(() => {
    let alive = true;
    let hideTimer: ReturnType<typeof setTimeout>;

    const beat = async () => {
      try {
        const res = await fetch(`/api/screen/${token}/heartbeat`, { method: "POST" });
        if (!res.ok || !alive) return;
        const { command, commandArg, theme, zoom } = await res.json();
        // Theme and text size are persistent per-screen settings; re-assert
        // them on every beat so a Fleet change lands within one poll.
        if (theme === "dark" || theme === "light") {
          document.documentElement.classList.toggle("dark", theme === "dark");
        }
        if (typeof zoom === "number" && zoom >= 50 && zoom <= 200) {
          // CSS zoom (not transform) so everything reflows; modern Chromium
          // keeps viewport units visually correct under root zoom, so the
          // board's fixed-height layout still fits the screen exactly.
          document.documentElement.style.zoom = zoom === 100 ? "" : `${zoom}%`;
        }
        if (command === "refresh") {
          window.location.reload();
        } else if (command === "identify") {
          setOverlay({ kind: "identify", name });
          clearTimeout(hideTimer);
          hideTimer = setTimeout(() => alive && setOverlay(null), IDENTIFY_MS);
        } else if (command === "message" && commandArg) {
          setOverlay({ kind: "message", text: commandArg });
          clearTimeout(hideTimer);
          hideTimer = setTimeout(() => alive && setOverlay(null), MESSAGE_MS);
        }
      } catch {
        // offline / transient — try again next tick
      }
    };

    beat(); // immediate first heartbeat
    const t = setInterval(beat, POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
      clearTimeout(hideTimer);
    };
  }, [token, name]);

  if (!overlay) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-black/85 p-10 text-center backdrop-blur-sm">
      {overlay.kind === "identify" ? (
        <>
          <div className="text-2xl font-medium uppercase tracking-widest text-blue-300">
            This screen is
          </div>
          <div className="text-[10vw] font-bold leading-none text-white">
            {overlay.name}
          </div>
        </>
      ) : (
        <div className="max-w-[80vw] text-[6vw] font-bold leading-tight text-white">
          {overlay.text}
        </div>
      )}
    </div>
  );
}
