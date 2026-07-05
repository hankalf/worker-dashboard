"use client";

import { useEffect, useRef, type ReactNode } from "react";

// Wraps content in a height-capped box that slowly scrolls up and down when the
// content is taller than the cap — so a long list (lunch schedule, positions,
// side tasks) stays readable on a fixed wall display without pushing the page
// taller. When `enabled` is false it renders the children unconstrained.
export function AutoScroll({
  enabled,
  maxHeightClass = "",
  children,
}: {
  enabled: boolean;
  maxHeightClass?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;

    let raf = 0;
    let dir = 1;
    let pause = 120; // brief hold at each end (frames)
    // scrollTop is quantised to integers, so 0.4px/frame would round away to
    // nothing — accumulate the true position as a float and write it each frame.
    let pos = el.scrollTop;

    const tick = () => {
      const overflow = el.scrollHeight - el.clientHeight;
      if (overflow > 2) {
        if (pause > 0) {
          pause--;
        } else {
          pos += dir * 0.4; // ~24px/s at 60fps — deliberately slow
          if (pos >= overflow) {
            pos = overflow;
            dir = -1;
            pause = 120;
          } else if (pos <= 0) {
            pos = 0;
            dir = 1;
            pause = 120;
          }
          el.scrollTop = pos;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled]);

  return (
    <div ref={ref} className={enabled ? `overflow-hidden ${maxHeightClass}` : ""}>
      {children}
    </div>
  );
}
