/**
 * Validates a partition vote's grouping against the pair it is cast on.
 *
 * Consensus classifies a partition vote by `groups.length` alone (one group = coherent, more =
 * over-merge) and the export emits the member ids verbatim, so the grouping must be a true
 * partition of the pair's members: every member in exactly one non-empty group, no ids from
 * outside the pair, and no more groups than the campaign allows.
 *
 * Returns null when the grouping is valid, otherwise a message describing the first problem.
 */
export function validatePartitionGroups(
  groups: unknown,
  memberIds: readonly string[],
  maxGroups: number,
): string | null {
  if (memberIds.length === 0) return "this pair has no member variables to group";
  if (!Array.isArray(groups) || groups.length === 0) return "groups must be a non-empty array";
  if (groups.length > maxGroups) return `at most ${maxGroups} groups are allowed`;

  const known = new Set(memberIds);
  const assigned = new Set<string>();
  for (const group of groups) {
    if (!Array.isArray(group) || group.length === 0) return "every group must be a non-empty array of member ids";
    for (const id of group) {
      if (typeof id !== "string") return "member ids must be strings";
      if (!known.has(id)) return `unknown member id "${id}"`;
      if (assigned.has(id)) return `member id "${id}" is assigned more than once`;
      assigned.add(id);
    }
  }
  if (assigned.size !== known.size) return "every member must be assigned to a group";
  return null;
}
