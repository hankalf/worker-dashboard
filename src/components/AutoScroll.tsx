"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";

// A single shared scroll clock so every AutoScroll section on the board moves
// together. One driver advances a shared position and each section sets its
// scrollTop to min(position, itsOwnOverflow). The designated leader (the
// positions section) sets the range: the driver runs 0 → leader's overflow and
// back, so everything tracks the positions scroll. A shorter section reaches
// its end first, holds there, and resumes once the leader scrolls back past it.
// (Falls back to the tallest section only when the leader isn't overflowing.)
type ScrollSync = {
  register: (el: HTMLDivElement, leader: boolean) => () => void;
};
const ScrollSyncContext = createContext<ScrollSync | null>(null);

const END_PAUSE = 120; // frames held at each end (~2s at 60fps)

export function ScrollSyncProvider({
  speed = 0.4,
  children,
}: {
  // Pixels per frame (~60fps); shared by every synced section.
  speed?: number;
  children: ReactNode;
}) {
  // element -> is this the leader (positions) section?
  const members = useRef<Map<HTMLDivElement, boolean>>(new Map());

  const register = useCallback((el: HTMLDivElement, leader: boolean) => {
    members.current.set(el, leader);
    return () => {
      members.current.delete(el);
    };
  }, []);

  useEffect(() => {
    let raf = 0;
    let dir = 1;
    let pause = END_PAUSE;
    let pos = 0;

    const tick = () => {
      const entries = [...members.current];
      const els = entries.map(([el]) => el);
      const overflows = els.map((el) => el.scrollHeight - el.clientHeight);
      const maxOverflow = overflows.reduce((m, o) => Math.max(m, o), 0);

      // The leader (positions) drives the range; fall back to the tallest
      // section only when the leader has nothing to scroll.
      let range = 0;
      entries.forEach(([, leader], i) => {
        if (leader) range = Math.max(range, overflows[i]);
      });
      if (range <= 2) range = maxOverflow;

      if (range > 2) {
        if (pause > 0) {
          pause--;
        } else {
          pos += dir * speed;
          if (pos >= range) {
            pos = range;
            dir = -1;
            pause = END_PAUSE;
          } else if (pos <= 0) {
            pos = 0;
            dir = 1;
            pause = END_PAUSE;
          }
        }
        // Content can shrink between frames (data refresh) — keep pos in range.
        if (pos > range) pos = range;
        els.forEach((el, i) => {
          el.scrollTop = Math.max(0, Math.min(pos, overflows[i]));
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [speed]);

  return (
    <ScrollSyncContext.Provider value={{ register }}>
      {children}
    </ScrollSyncContext.Provider>
  );
}

// Wraps content in a height-capped box that slowly scrolls up and down when the
// content is taller than the cap — so a long list (lunch schedule, positions,
// side tasks) stays readable on a fixed wall display without pushing the page
// taller. When `enabled` is false it renders the children unconstrained.
//
// Inside a ScrollSyncProvider the shared driver moves it; otherwise it runs its
// own independent up/down loop (unchanged legacy behavior).
export function AutoScroll({
  enabled,
  maxHeightClass = "",
  speed = 0.4,
  syncLeader = false,
  children,
}: {
  enabled: boolean;
  maxHeightClass?: string;
  // Pixels per frame (~60fps); 0.4 ≈ 24px/s, the original pace. Ignored when a
  // ScrollSyncProvider is driving (the provider owns the shared speed).
  speed?: number;
  // In a ScrollSyncProvider, mark this section as the one whose scroll range
  // drives all the others (the positions section on the board).
  syncLeader?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const sync = useContext(ScrollSyncContext);

  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;

    // Synced mode: hand the element to the shared driver and let it own scroll.
    if (sync) {
      el.scrollTop = 0;
      return sync.register(el, syncLeader);
    }

    // Standalone mode: independent up/down loop.
    let raf = 0;
    let dir = 1;
    let pause = END_PAUSE;
    // scrollTop is quantised to integers, so 0.4px/frame would round away to
    // nothing — accumulate the true position as a float and write it each frame.
    let pos = el.scrollTop;

    const tick = () => {
      const overflow = el.scrollHeight - el.clientHeight;
      if (overflow > 2) {
        if (pause > 0) {
          pause--;
        } else {
          pos += dir * speed;
          if (pos >= overflow) {
            pos = overflow;
            dir = -1;
            pause = END_PAUSE;
          } else if (pos <= 0) {
            pos = 0;
            dir = 1;
            pause = END_PAUSE;
          }
          el.scrollTop = pos;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled, speed, sync, syncLeader]);

  return (
    <div ref={ref} className={enabled ? `overflow-hidden ${maxHeightClass}` : ""}>
      {children}
    </div>
  );
}
