// How many unpinned notices the main dashboard shows at once (pinned notices
// always show, above this cap). Active notices beyond the cap queue up (oldest
// first) and appear as visible ones expire.
export const MAX_VISIBLE_NOTICES = 3;

// Split active notices into what's shown on the board vs. queued. Pinned notices
// always show (even beyond the cap) and are listed first; unpinned notices fill
// the remaining slots up to MAX_VISIBLE_NOTICES, oldest first. Expects `active`
// already ordered by createdAt ascending.
export function splitNotices<T extends { pinned: boolean }>(
  active: T[]
): { visible: T[]; queued: T[] } {
  const pinned = active.filter((n) => n.pinned);
  const unpinned = active.filter((n) => !n.pinned);
  const slots = Math.max(0, MAX_VISIBLE_NOTICES - pinned.length);
  return {
    visible: [...pinned, ...unpinned.slice(0, slots)],
    queued: unpinned.slice(slots),
  };
}
