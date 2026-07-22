// Reviewer-home ownership helpers. `GET /api/campaigns` is now the viewer's
// access-filtered *visible set* (Axis-1's listCampaignsForUser), where each
// campaign carries `viewerRole: "owner" | "participant" | null`. The home page
// renders a single "Your campaigns" list, owned-first, so these helpers turn the
// per-campaign role into (a) a role map the UI reads for affordance visibility
// and (b) an owned-first ordering. This replaces the old joined-vs-"Browse all"
// `partitionByMembership` split.

export type ViewerRole = "owner" | "participant";

type WithViewerRole = { id: string; viewerRole?: ViewerRole | null };

/**
 * Build a `{ id -> role }` map the UI reads to gate owner affordances (R9).
 *
 * `isAdmin` overrides to implicit-owner for every visible campaign — admins are a
 * global superset and their campaigns may carry `viewerRole: null` (CS1). For a
 * non-admin, a missing/null `viewerRole` conservatively defaults to
 * `"participant"` (never an accidental owner affordance).
 */
export function deriveRoleById<T extends WithViewerRole>(
  campaigns: T[],
  isAdmin: boolean,
): Record<string, ViewerRole> {
  const roleById: Record<string, ViewerRole> = {};
  for (const c of campaigns) {
    roleById[c.id] = isAdmin ? "owner" : c.viewerRole ?? "participant";
  }
  return roleById;
}

/**
 * Order a campaign list owned-first, then participant, stable within each group
 * (R2). Pure and non-mutating. An id absent from `roleById` is treated as
 * `"participant"` and lands in the tail — never dropped.
 */
export function sortByOwnership<T extends { id: string }>(
  campaigns: T[],
  roleById: Record<string, ViewerRole>,
): T[] {
  const owners: T[] = [];
  const participants: T[] = [];
  for (const c of campaigns) {
    (roleById[c.id] === "owner" ? owners : participants).push(c);
  }
  return [...owners, ...participants];
}

// --- Blinding guard (R10) -------------------------------------------------
// Membership/roster surfaces must expose ONLY identity + role + join facts —
// never a machine pick, candidate, or any provenance-adjacent field. This is the
// canonical allow-list plus a pure guard used at the test layer to catch a
// contract drift that leaks such a field into a row the UI consumes.
export const MEMBERSHIP_ROW_KEYS = [
  "userId",
  "email",
  "displayName",
  "role",
  "joinedAt",
] as const;

export function hasOnlyMembershipKeys(row: Record<string, unknown>): boolean {
  const allowed = new Set<string>(MEMBERSHIP_ROW_KEYS);
  return Object.keys(row).every((k) => allowed.has(k));
}
