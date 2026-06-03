// Reviewer-focus home helper. Splits the active campaigns a reviewer can see
// into the ones they've joined (link-opened) vs the rest ("Browse all").
// A campaign lands in exactly one bucket (dedup), and a joined id that isn't in
// the current active list (e.g. archived since joining) is naturally dropped —
// we only iterate the campaigns we were given.

export function partitionByMembership<T extends { id: string }>(
  campaigns: T[],
  joinedIds: string[],
): { joined: T[]; others: T[] } {
  const joinedSet = new Set(joinedIds);
  const joined: T[] = [];
  const others: T[] = [];
  for (const c of campaigns) {
    (joinedSet.has(c.id) ? joined : others).push(c);
  }
  return { joined, others };
}
