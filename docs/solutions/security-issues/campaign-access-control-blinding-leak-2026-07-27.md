---
title: "Retrofitting per-campaign access control: ownerless-on-create + a per-reviewer analytics blinding leak"
date: 2026-07-27
category: security-issues
module: expert-in-the-loop (campaign access control)
problem_type: security_issue
component: authentication
symptoms:
  - "A blinded reviewer (campaign participant) could read other reviewers' identities and score-linked notes via GET /api/analytics/campaigns/:id/{reviewers,disagreements,skips}"
  - "Those per-reviewer analytics endpoints were guarded only by requireCampaignAccess (owner OR participant)"
  - "Campaigns created after the migration had zero owner memberships, violating the >=1-owner invariant"
  - "Ownerless campaigns were manageable only through the global-admin bypass"
  - "Manual QA (Sections A-G all PASS) missed both; caught only by an adversarial review that executed the endpoints as each role"
root_cause: missing_permission
resolution_type: code_fix
severity: high
related_components:
  - database
  - analytics-endpoints
  - client-analytics-ui
tags:
  - access-control
  - authorization
  - blinding
  - row-level-security
  - create-path-wiring
  - backfill-gap
  - greptile-review
  - ownerless-campaign
---

# Retrofitting per-campaign access control: ownerless-on-create + a per-reviewer analytics blinding leak

## Problem

Two P1 authorization/data-integrity defects shipped into the prod-promotion PR (#36) for the Expert-in-the-Loop review platform, after the owner/participant access model (PRs #31–#33) was retrofitted onto existing data: (1) newly created campaigns were persisted with **zero owners**, and (2) three per-reviewer analytics endpoints leaked other reviewers' identities and score-linked notes to any participant. Impact: new campaigns became unmanageable without the global-admin bypass, and reviewer **blinding was broken** — an active participant could see who voted what before casting their own independent judgment.

## Symptoms

- **Ownerless-on-create (Bug 1):** `POST /api/campaigns` returned `201 Created`, but the resulting campaign had an empty `campaign_memberships` set — violating the `≥1-owner` access invariant. The prior backfill only repaired *pre-existing* rows, so every campaign created after deploy started ownerless. Greptile's T-Rex reproduced it by executing the create route and observing the empty membership state.
- **Broken blinding (Bug 2):** as a plain participant (blinded reviewer), `GET /api/analytics/campaigns/:id/disagreements` returned `200 OK` with high-disagreement pairs including `reviewerNotes: {note, scoreBinary, scoreNumeric}[]` — other reviewers' score-linked notes. `/reviewers` (identities + agreement rates) and `/skips` (skips-by-reviewer) leaked the same way. T-Rex reproduced by hitting the endpoint as a participant and getting score-linked notes back.
- **QA blind spot:** thorough manual QA (Sections A–G) had **all passed** and missed both defects; only an adversarial reviewer that *executed the endpoints as each role* caught them.

## What Didn't Work

Manual QA Sections A–G all passed but failed to surface either bug:

- It exercised the participant review flow and analytics **scoping** (which campaigns/rows a role can see) but never inspected the per-reviewer **content** of the disagreement/reviewer/skips views *as a participant* — so the identity/notes leak went unnoticed.
- It never created a **new** campaign through `POST /api/campaigns`, so the ownerless-on-create path was never walked. The QA fixtures were seeded by **reassigning ownership of pre-existing campaigns** to the test accounts, never by exercising the actual `createCampaign` code path (session history).
- The existing automated coverage was a backfill + invariant test over **existing rows** only; it asserted nothing about the insert path, so a create that skipped owner membership passed CI.
- Notably, the ≥1-owner invariant *was* explicitly protected on the **removal** path — owner removal is serialized to prevent a last-owner TOCTOU race (commit `50c57e4`; see the last-owner doc below). The **create** path never got the equivalent guarantee, so the invariant was enforced on deletion but not on insertion (session history).
- Process-wise, the sections where these bugs lived (C: members, E: admin-vs-owner, F: blinding, G: analytics) were **deferred** in an earlier QA session that completed only A–B before pausing — they weren't skipped carelessly, but the deferral meant the risky content-vs-scoping distinction wasn't examined until late (session history).

## Solution

**(a) `createCampaign`: VALUES-only insert → transactional campaign + owner-membership upsert** (`server/storage.ts`)

Before:
```ts
async createCampaign(campaign: InsertCampaign): Promise<Campaign> {
  const [created] = await db.insert(campaigns).values(campaign).returning();
  return created;
}
```

After:
```ts
async createCampaign(campaign: InsertCampaign): Promise<Campaign> {
  // Create the campaign AND its creator's owner membership atomically. Every
  // campaign must have >=1 owner so it satisfies the access invariant (backfill
  // covers pre-existing campaigns; this covers ones created after deploy).
  return db.transaction(async (tx) => {
    const [created] = await tx.insert(campaigns).values(campaign).returning();
    await tx
      .insert(campaignMemberships)
      .values({ campaignId: created.id, userId: created.createdBy, role: "owner" })
      .onConflictDoUpdate({
        target: [campaignMemberships.campaignId, campaignMemberships.userId],
        set: { role: "owner" },
      });
    return created;
  });
}
```

**(b) Three per-reviewer analytics routes: `requireCampaignAccess` → `requireCampaignOwner`** (`server/routes.ts`)

Before (all three of `/reviewers`, `/disagreements`, `/skips`):
```ts
app.get("/api/analytics/campaigns/:id/reviewers",     requireAuth, requireCampaignAccess("param"), handler);
app.get("/api/analytics/campaigns/:id/disagreements", requireAuth, requireCampaignAccess("param"), handler);
app.get("/api/analytics/campaigns/:id/skips",         requireAuth, requireCampaignAccess("param"), handler);
```

After:
```ts
app.get("/api/analytics/campaigns/:id/reviewers",     requireAuth, requireCampaignOwner("param"), handler);
app.get("/api/analytics/campaigns/:id/disagreements", requireAuth, requireCampaignOwner("param"), handler);
app.get("/api/analytics/campaigns/:id/skips",         requireAuth, requireCampaignOwner("param"), handler);
```

`requireCampaignOwner` accepts `owner|admin`; `requireCampaignAccess` accepts `owner|participant|admin` (`server/campaignAccess.ts`). The aggregate endpoints (`/votes` distribution, `/alpha`) intentionally stay on `requireCampaignAccess` — they carry no per-reviewer identity.

**Client gating** (`client/src/pages/admin/analytics.tsx`) — hides the three tabs and skips their queries so non-owners never fire a 403:
```ts
const { isAdmin } = useAuth();
const canSeeReviewerDetail = isAdmin || selectedFull?.viewerRole === "owner";
// each reviewer-detail query: enabled: !!selectedCampaign && canSeeReviewerDetail
// the reviewers/disagreements/skips <TabsTrigger> + <TabsContent> wrapped in {canSeeReviewerDetail && (...)}
```

Verified: typecheck clean (pre-existing `pg`-types error aside), 114/114 tests pass, and Greptile's re-review of the fix PR (#37) rated it 5/5 "safe to merge."

## Why This Works

- Establishing the creator's owner membership *inside the create transaction* satisfies the `≥1-owner` invariant on the exact code path the backfill can never reach. Backfill (old rows) + transactional insert (new rows) together close the invariant across all origins, atomically, so a partial failure can't leave an ownerless campaign.
- Splitting the guard makes explicit that "can access this campaign" and "can see per-reviewer decision data about this campaign" are **two distinct authorization tiers**. Per-reviewer identity, score-linked notes, and skip patterns are owner/admin-tier; gating them behind `requireCampaignOwner` restores blinding. The client gating is UX only — the server middleware is the actual enforcement.

## Prevention

1. **When retrofitting a row-level access invariant, wire every mutation path, not just some.** A backfill establishes an invariant once; it's only *maintained* if every insert (and update) path re-establishes it. Here the *removal* path was carefully guarded while *create* was not. Add a create-path test that asserts the owner membership exists immediately after `createCampaign` — not just a backfill/invariant test over pre-existing rows.
2. **Treat "can access X" and "can see per-participant/decision data about X" as separate authorization tiers.** Audit every endpoint that returns other users' identities, notes, or decisions and confirm it sits on the stricter tier — don't let it inherit the general access guard by default.
3. **Manual QA that checks *scoping* is not the same as checking *field-level content*.** Verifying which rows a role can see says nothing about what's inside a row they're allowed to fetch. An adversarial review that *executes each endpoint as each role* (as Greptile's T-Rex did) catches leaks and missing-write-path defects that click-through QA structurally cannot.
4. **Seed test fixtures via the real code paths, not shortcuts.** These fixtures were created by reassigning existing ownership rows, which structurally guaranteed the create-path gap would never be exercised. When a code path carries an invariant, at least one fixture/test should build data *through* it.

## Related Issues

- `docs/solutions/database-issues/campaign-access-backfill-enum-text-coercion-2026-07-22.md` — the *backfill* half of the ownerless problem (a `text`→enum cast failure left every campaign ownerless). Complementary: that doc fixes the backfill for existing campaigns; this one fixes the create path for new ones — the exact "backfill only fixed existing rows" gap.
- `docs/solutions/database-issues/last-owner-invariant-nonatomic-count-then-delete-race-2026-07-22.md` — the same ≥1-owner invariant on the *removal* path (a TOCTOU delete race). This doc is the create-path omission of the same invariant; together they show the invariant must hold across create/remove alike.
- `docs/solutions/best-practices/blinded-ownership-participant-access-ui-2026-07-21.md` — the client UI access surface for this feature. Its guidance to "keep the server authoritative" is right, but note its confidence in the server tier was optimistic: this doc shows the server analytics guards were themselves too broad. (Refresh candidate — see below.)
- `docs/solutions/workflow-issues/drizzle-destructive-migration-vs-auto-deploy-2026-05-29.md` — the deploy-ordering context that let access-model gaps ship silently to dev.
- Shipped as PR #37 (`fix/greptile-prod-blockers` → `dev` → promoted via #36). No related GitHub issues (tracked via PRs).
