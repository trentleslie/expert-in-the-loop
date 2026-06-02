---
title: "Single-string TanStack detail keys escape list-prefix invalidation — Configure dialog reopens stale"
date: 2026-06-02
category: logic-errors
module: TanStack Query client data layer (client/src/lib/queryClient.ts)
problem_type: logic_error
component: frontend_stimulus  # enum is Rails-oriented; real component is the React/TanStack Query data layer
severity: high
symptoms:
  - "After saving a campaign config and REOPENING the Configure dialog, the editor shows the PRE-SAVE config — the change looks reverted"
  - "The DB has actually persisted the change (showExternalLinks:true + linkTemplate, consensus values intact — confirmed by querying dev Postgres directly); HTTP 200 throughout, no error"
  - "Only the reopened editor is stale; results/analytics/exports all show the correct saved value"
root_cause: logic_error
resolution_type: code_fix
related_components:
  - tanstack-query
  - react-query-data-layer
tags:
  - tanstack-query
  - react-query
  - query-invalidation
  - querykey
  - stale-cache
  - staletime
  - prefix-invalidation
---

# Single-string TanStack detail keys escape list-prefix invalidation — Configure dialog reopens stale

## Problem

Converting a `useQuery` key from a multi-segment array (`["/api/campaigns", id]`) to a single interpolated string (`` [`/api/campaigns/${id}`] ``) silently **removes the query from the coverage of any list-prefix `invalidateQueries({ queryKey: ["/api/campaigns"] })` call**. With the app's global `staleTime: Infinity`, the un-invalidated detail query then serves cached data forever — so the Configure-campaign dialog reopened showing the **pre-save** config even though the save had persisted correctly to the database.

This is the direct sequel to [`getqueryfn-querykey-footgun-2026-06-01.md`](getqueryfn-querykey-footgun-2026-06-01.md): that doc's fix for finding #5 (switch to a single-string key so `getQueryFn` hits the detail endpoint) is exactly what created this gap.

## Symptoms

1. Edit a campaign's config in the Configure dialog → Save → **reopen** the dialog → the editor shows the **pre-save** values (the change looks reverted).
2. The database is correct: a direct dev Postgres query confirmed `showExternalLinks: true`, `linkTemplate` set, and the consensus thresholds intact. The save round-tripped fine.
3. No error, no failed request — **HTTP 200 throughout**. Results, analytics, and exports all reflect the saved value. Only the *reopened editor* is stale.

## What Didn't Work

The predecessor doc ([`getqueryfn-querykey-footgun-2026-06-01.md`](getqueryfn-querykey-footgun-2026-06-01.md), "What Didn't Work", lines 43–52) **explicitly ruled out** the stale-cache / invalidation hypothesis for the *original* #5 clobber bug. That was correct **at the time**: the old key `["/api/campaigns", id]` still element-wise prefix-matched `["/api/campaigns"]`, so `handleRefresh` *did* invalidate it. The real #5 cause was the read path (`getQueryFn` fetching `queryKey[0]` only → the list endpoint). *(session history: the #5 investigation traced this to `queryClient.ts` reading `queryKey[0]` as the URL; the invalidation was never the #5 culprit.)*

So the trap here is believing a settled conclusion still holds after the code under it changed. The #5 fix collapsed the key to a single string — and **that** flipped the previously-false staleness hypothesis into a genuine, separate bug. The old "ruled out" note is still correct *for the multi-segment key it described*; it just no longer describes the current code.

## Solution

Add `staleTime: 0` to the dialog's detail query so each open refetches fresh, independent of whatever `handleRefresh` invalidates. Commit `33f3b4c`.

**`client/src/pages/admin/campaigns.tsx`** — `ConfigureCampaignDialog` (~L444):

```ts
// Before — never refetched after the first open (staleTime: Infinity inherited),
// and list-prefix invalidation doesn't reach this single-string key:
const { data: fullCampaign } = useQuery<Campaign>({
  queryKey: [`/api/campaigns/${campaign.id}`],
  enabled: open,
});

// After — staleTime: 0 forces a fresh fetch every time the dialog re-enables:
const { data: fullCampaign } = useQuery<Campaign>({
  queryKey: [`/api/campaigns/${campaign.id}`],
  enabled: open,
  staleTime: 0,
});
```

`handleRefresh` (~L755) was left unchanged — it still invalidates only the lists, which is fine for the cards/progress it's meant to refresh:

```ts
queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
queryClient.invalidateQueries({ queryKey: ["/api/users/me/votes"] });
queryClient.invalidateQueries({ queryKey: ["/api/users/me/stats"] });
```

**Alternatives considered (rejected):**

1. **Exact-key invalidation** — add `queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${id}`] })` to `handleRefresh`. Rejected: couples the page-level refresh handler to a child dialog's specific key, and needs the id at the save-handler level — easy to forget when keys change. *(session history: also flagged that `handleRefresh` doesn't know the campaign id at its scope.)*
2. **`setQueryData` on the mutation result** — write the PUT response straight into the detail cache. Rejected: more code, and requires the PUT response shape to match the detail GET shape exactly.

`staleTime: 0` won because it is local to the one short-lived, `enabled: open` query, needs no cross-component coupling, and the dialog opens rarely enough that a refetch-on-open is cheap.

## Why This Works

- `invalidateQueries({ queryKey })` matches **element-wise by prefix**: a cache key matches only if every element of the invalidation key equals the corresponding element of the cache key. The single-element string `"/api/campaigns"` cannot prefix-match the *different* single-element string `"/api/campaigns/abc"` — they are two distinct `queryKey[0]` values, not a prefix relationship. (A two-element key `["/api/campaigns", "abc"]` *does* match, because element 0 is equal and the invalidation key is a strict prefix.)
- Under the global `staleTime: Infinity`, a query that is never invalidated is considered fresh forever and is served from cache — even across the dialog closing and reopening.
- `staleTime: 0` marks the query stale immediately, so when the `enabled: open` query re-activates on reopen, TanStack Query refetches instead of serving the cached pre-save value. The editor's `useEffect([open, fullCampaign])` then re-seeds local state from the fresh config. *(session history: that `useEffect` seeding pattern was deliberately preserved across both fixes.)*

## Prevention

**Rule of thumb:** a **single-string detail key is invisible to list-prefix invalidation.** The moment you convert a multi-segment key to a single string to drive the default `getQueryFn`, you forfeit whatever prefix-invalidation coverage it used to have. Re-establish freshness explicitly with one of:

```ts
// (campaignId must be in scope — patterns 1 and 3 need the id at the call site,
//  which is exactly why handleRefresh, lacking it, used pattern 2 instead.)

// 1. Exact-key invalidation on every mutation that changes that resource:
queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${campaignId}`] });

// 2. staleTime: 0 (or refetchOnMount) on the query — best for short-lived,
//    enabled-gated dialogs/detail views that should always show current data:
useQuery({ queryKey: [`/api/campaigns/${campaignId}`], enabled: open, staleTime: 0 });

// 3. setQueryData to write the mutation result into the exact detail key:
queryClient.setQueryData([`/api/campaigns/${campaignId}`], updatedCampaign);
```

**Pair this with the existing dev-time guard.** `client/src/lib/queryClient.ts`'s `getQueryFn` already `console.warn`s when a query key has `>1` segment and no explicit `queryFn` — it steers you toward single-string keys, which is precisely the shape that drops list-prefix invalidation. The two facts must be taught together: *choosing a single-string key for correct endpoint resolution obligates you to handle invalidation/freshness explicitly, because `["/api/campaigns"]` will no longer reach it.*

**Audit the siblings.** The same predecessor fix converted detail keys in `client/src/pages/admin/results.tsx` and `client/src/pages/admin/analytics.tsx` to single strings. They carry the same latent exposure — verify each either doesn't rely on list-prefix invalidation for freshness, or handles it via one of the three patterns above.

**Watch for "settled conclusions" under changed code.** This bug existed because a correct "ruled out" note from the predecessor investigation was read as still-true after the code it described had been replaced. When a fix changes the exact mechanism an earlier analysis reasoned about, re-validate that analysis — don't inherit its conclusion.

## Related Issues

- **Predecessor (cause of this gap):** [`getqueryfn-querykey-footgun-2026-06-01.md`](getqueryfn-querykey-footgun-2026-06-01.md) — its finding #5 fix (multi-segment → single-string key) created this invalidation gap. Its "What Didn't Work" stale-cache note was correct for the multi-segment key but no longer describes the current single-string key.
- **QA:** `docs/qa/2026-06-01-campaign-config-ux-verification-checklist.md` (finding #5 row + regression row **R1**, where this reopen-staleness was caught and fixed); original symptom resembles `docs/qa/2026-05-29-generalization-ui-qa-checklist.md` finding #5.
- **Plan:** `docs/plans/2026-06-01-001-fix-campaign-config-ux-plan.md`.
- **Fix commit:** `33f3b4c` (branch `dev`). Predecessor #5 fix: `0f21dec` / `86bde0d` (PR #8, merge `68ccc06`).
