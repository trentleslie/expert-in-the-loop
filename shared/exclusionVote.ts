/**
 * Validates an exclusion vote's flagged member ids against the pair it is cast on.
 *
 * The ids are stored verbatim and surface in vote history and campaign exports (per-member
 * exclusion rate), so each one must name a real member of the pair and appear at most once.
 * An empty array is valid: nothing flagged means "one concept".
 *
 * Returns null when the selection is valid, otherwise a message describing the first problem.
 */
export function validateExcludedMembers(excluded: unknown, memberIds: readonly string[]): string | null {
  if (memberIds.length === 0) return "this pair has no member variables to review";
  if (!Array.isArray(excluded)) return "excluded must be an array of member ids (possibly empty)";

  const known = new Set(memberIds);
  const seen = new Set<string>();
  for (const id of excluded) {
    if (typeof id !== "string") return "member ids must be strings";
    if (!known.has(id)) return `unknown member id "${id}"`;
    if (seen.has(id)) return `member id "${id}" is listed more than once`;
    seen.add(id);
  }
  return null;
}
