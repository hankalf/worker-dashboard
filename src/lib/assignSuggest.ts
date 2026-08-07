// Working out who should fill a shift's understaffed positions.
//
// Kept free of Prisma and request context so the matching can be reasoned about
// (and tested) on its own; the route supplies the roster and writes the result.

export type SuggestPosition = {
  id: string;
  title: string;
  target: number; // required headcount for the shift (0 = no target)
  assigned: number; // people already on it
  requiredRoleId: string | null; // equipment
  requiredCapabilityId: string | null; // job function
};

export type SuggestEmployee = {
  id: string;
  name: string;
  roleIds: string[];
  capabilityIds: string[];
};

export type Suggestion = {
  employeeId: string;
  employeeName: string;
  positionId: string;
  positionTitle: string;
};

export type SuggestResult = {
  suggestions: Suggestion[];
  unfilled: { positionTitle: string; short: number }[];
};

// A position with no requirement accepts anyone; otherwise the person must hold
// both what it asks for.
export function qualifies(e: SuggestEmployee, p: SuggestPosition): boolean {
  if (p.requiredRoleId && !e.roleIds.includes(p.requiredRoleId)) return false;
  if (p.requiredCapabilityId && !e.capabilityIds.includes(p.requiredCapabilityId))
    return false;
  return true;
}

// Fill the gaps greedily, hardest first: the position fewest people can work is
// filled before easier ones, and from its candidates the person with the fewest
// alternatives is used — so a specialist isn't spent on a slot anyone could
// cover, leaving their own slot empty.
export function planAssignments(
  positions: SuggestPosition[],
  pool: SuggestEmployee[]
): SuggestResult {
  const byId = new Map(positions.map((p) => [p.id, p]));
  const gaps = new Map<string, number>();
  for (const p of positions) {
    const short = p.target - p.assigned;
    if (p.target > 0 && short > 0) gaps.set(p.id, short);
  }

  const suggestions: Suggestion[] = [];
  const taken = new Set<string>();

  while (gaps.size > 0) {
    const available = pool.filter((e) => !taken.has(e.id));
    if (available.length === 0) break;

    let bestId: string | null = null;
    let bestCandidates: SuggestEmployee[] = [];
    for (const positionId of gaps.keys()) {
      const p = byId.get(positionId);
      if (!p) continue;
      const candidates = available.filter((e) => qualifies(e, p));
      if (candidates.length === 0) continue;
      if (bestId === null || candidates.length < bestCandidates.length) {
        bestId = positionId;
        bestCandidates = candidates;
      }
    }
    if (bestId === null) break; // nobody left qualifies for anything open

    const openPositions = [...gaps.keys()]
      .map((id) => byId.get(id))
      .filter((p): p is SuggestPosition => !!p);
    const flexibility = (e: SuggestEmployee) =>
      openPositions.filter((p) => qualifies(e, p)).length;
    const pick = bestCandidates.reduce((a, b) =>
      flexibility(a) <= flexibility(b) ? a : b
    );

    const position = byId.get(bestId)!;
    suggestions.push({
      employeeId: pick.id,
      employeeName: pick.name,
      positionId: position.id,
      positionTitle: position.title,
    });
    taken.add(pick.id);

    const left = (gaps.get(bestId) ?? 1) - 1;
    if (left <= 0) gaps.delete(bestId);
    else gaps.set(bestId, left);
  }

  return {
    suggestions,
    unfilled: [...gaps.entries()].map(([id, short]) => ({
      positionTitle: byId.get(id)?.title ?? "",
      short,
    })),
  };
}
