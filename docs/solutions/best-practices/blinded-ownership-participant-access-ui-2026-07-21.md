---
title: "Layering an owner/participant access UI onto a blinded review app (EITL campaigns, Axis-2)"
date: 2026-07-21
category: best-practices
module: "Campaigns client UX (client/src/pages/home.tsx, client/src/lib/campaignFocus.ts, client/src/components/MembersDialog.tsx)"
problem_type: best_practice
component: react_component
severity: medium
applies_when:
  - Adding owner/participant (ownership + membership) affordances to a client that must keep reviewer identity or scoring provenance blinded
  - Rendering a per-viewer access-filtered list where each row carries a `viewerRole: "owner" | "participant" | null` tag
  - Building a roster/members dialog with role-gated mutations (remove participant, add co-owner) against server-authoritative guards
  - Consuming a stacked upstream PR (this is Axis-2, stacked on Axis-1's access-filtered list + membership endpoints)
tags:
  - blinding
  - least-privilege-ui
  - ownership
  - membership
  - react
  - pure-helpers
  - stacked-pr
  - eitl
related_pr: "https://github.com/trentleslie/expert-in-the-loop/pull/32"
---

# Layering an owner/participant access UI onto a blinded review app (EITL campaigns, Axis-2)

## Context

EITL is a blinded review/scoring app: reviewers must not see machine picks, candidate IDs, or scoring provenance that would bias their judgment. Axis-2 of the campaign ownership/participation work (PR #32) turns the reviewer home and admin campaign-management UI into an owner/participant **access surface** — a single access-filtered "Your campaigns" list (owned-first), plus a reusable `MembersDialog` for roster management (role badges, copy-share-link, remove-participant, add-co-owner). It consumes Axis-1's access-filtered list (`listCampaignsForUser` tagging each campaign with `viewerRole`) and membership endpoints (`DELETE /participants/:userId`, `POST /owners`).

The interesting part of this run is not the feature — it is the set of invariants the pipeline's adversarial validation forced into the code as encoded, tested guards. Adding a membership/roster surface to a blinded app is exactly where an identity/provenance leak or an accidental privilege escalation slips in.

## Guidance

Five guards, each encoded as a pure helper + colocated vitest so a future contract change trips a test rather than shipping a leak. Source: `client/src/lib/campaignFocus.ts` and its `.test.ts`.

**1. Blinding allow-list at the row contract (R10).** Membership/roster rows may expose *only* identity + role + join facts, never a provenance-adjacent field. Encode the allow-list and a pure guard, and test that a drifted row fails:

```ts
export const MEMBERSHIP_ROW_KEYS = [
  "userId", "email", "displayName", "role", "joinedAt",
] as const;

export function hasOnlyMembershipKeys(row: Record<string, unknown>): boolean {
  const allowed = new Set<string>(MEMBERSHIP_ROW_KEYS);
  return Object.keys(row).every((k) => allowed.has(k));
}
// test: { ...validRow, machinePick } / candidateId / sourceId  → false
```

The guard lives at the test/contract layer specifically to catch a *future* schema change that widens the roster row and leaks `machinePick`/`candidateId`/`sourceId` into a surface the UI renders.

**2. Fail-safe default to least privilege.** A missing/null `viewerRole` on a non-admin defaults to `"participant"`, never `"owner"` — a null role must never produce an accidental owner affordance:

```ts
roleById[c.id] = isAdmin ? "owner" : c.viewerRole ?? "participant";
```

**3. Handle the admin superset explicitly (CS1).** Admin campaigns legitimately carry `viewerRole: null`. `isAdmin` overrides every visible campaign to implicit owner rather than letting null read as "no role." Don't conflate "null because admin (superset)" with "null because not a member."

**4. Never drop a row from the visible set.** `sortByOwnership` reorders owned-first but an id absent from the role map lands in the participant tail — it is never filtered out. Ordering must not silently shrink the access-filtered list.

**5. Mirror server guards on the client, but keep the server authoritative.** The last-owner-remove guard is *disabled* on the client (`isLastOwner = isOwner && ownerCount <= 1` → button disabled, "Remove (last owner)") for UX, but authoritatively enforced server-side; the mutation's error handler still surfaces the server's "can't remove the last owner" 4xx. Defense in depth — the client guard is convenience, not security.

## Why This Matters

- **A blinded app leaks through its newest surface.** Every new panel that renders server data is a fresh chance to leak provenance. A tested allow-list turns "did we remember to strip that field?" from a code-review judgment call into a red test.
- **UI privilege bugs are silent.** Defaulting a null role to owner, or dropping an untagged campaign, produces no error — just a wrong affordance or a missing entry. Pure, unit-tested helpers make these invariants observable.
- **Pure helpers are cheap to prove.** `deriveRoleById`/`sortByOwnership` are pure and non-mutating, so the whole role-mapping + ordering contract (empty list, null role, admin override, unknown id, stability, no-mutation) is covered by fast vitest with no DOM.

## When to Apply

Any time you add a management/roster/ownership surface to a client that also renders blinded or otherwise access-restricted data — reach for a tested field allow-list, a least-privilege default for missing role/permission tags, explicit handling of the admin/superset null, and client guards that mirror (never replace) server-authoritative checks.

## Examples

Test-first (task order put the helper tests before the component): the `deriveRoleById`/`sortByOwnership` vitest was written against the desired contract, then the reviewer-home rewrite and `MembersDialog` consumed the proven helpers. This replaced the old joined-vs-"Browse all" `partitionByMembership` split with a single access-filtered list.

**Stacked-PR hygiene (process note):** PR #32 was opened against base `feat/campaign-access-authorization` (Axis-1 #31), *not* `dev`, so the diff shows only the client/UX changes and reviewers aren't re-reading Axis-1's server work. GitHub auto-retargets to `dev` when #31 merges. Stacking axes this way keeps each review surface small and single-concern.

## Related

- `docs/solutions/logic-errors/patch-campaigns-details-status-guard-and-noop-update-2026-06-18.md` — same campaigns module, server-side guard footguns (the authoritative side of guard #5)
- `docs/solutions/best-practices/clerk-auth-migration-express-react-2026-05-06.md` — auth/identity context these access surfaces sit on top of
