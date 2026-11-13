/**
 * Member variables of a pair, read from the free-form `pairs.source_metadata.members` jsonb.
 *
 * `source_metadata` is imported data with no enforced shape, so every consumer (the review
 * controls and the server-side vote validation) goes through this one parser. Both sides
 * therefore agree on exactly which member ids exist for a pair.
 *
 * Entries without a usable string id are dropped, and a repeated id keeps its first entry:
 * ids are what a vote stores and what React keys on, so they must be present and unique.
 */
export type PairMember = { id: string; text: string };

export function parseMembers(sourceMetadata: unknown): PairMember[] {
  if (sourceMetadata == null || typeof sourceMetadata !== "object") return [];
  const raw = (sourceMetadata as { members?: unknown }).members;
  if (!Array.isArray(raw)) return [];

  const seen = new Set<string>();
  const members: PairMember[] = [];
  for (const entry of raw) {
    if (entry == null || typeof entry !== "object") continue;
    const { id, text } = entry as { id?: unknown; text?: unknown };
    if (typeof id !== "string" || id.trim() === "" || seen.has(id)) continue;
    seen.add(id);
    // A member with an id but no readable text is still votable; show the id rather than a blank row.
    members.push({ id, text: typeof text === "string" && text.trim() !== "" ? text : id });
  }
  return members;
}
