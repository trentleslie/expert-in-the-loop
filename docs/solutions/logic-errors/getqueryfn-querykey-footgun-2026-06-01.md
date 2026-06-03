---
title: "getQueryFn fetches queryKey[0] only — multi-segment keys silently hit the list endpoint"
date: 2026-06-01
category: logic-errors
module: TanStack Query client data layer (client/src/lib/queryClient.ts)
problem_type: logic_error
component: frontend_stimulus  # enum is Rails-oriented; real component is the React/TanStack Query data layer
severity: high
symptoms:
  - "Campaign Configure dialog loads DEFAULT_CAMPAIGN_CONFIG and saving overwrites the campaign's real config (custom labels, external-link settings lost)"
  - "Analytics detail tabs (votes/reviewers/disagreements/skips) render blank with no error"
  - "useQuery with a multi-segment key returns the list endpoint's array instead of the detail object — 200 OK, wrong shape, nothing thrown"
root_cause: wrong_api
resolution_type: code_fix
related_components:
  - tanstack-query
  - react-query-data-layer
tags:
  - tanstack-query
  - react-query
  - querykey
  - getqueryfn
  - silent-data-loss
  - query-function
  - data-fetching
---

# getQueryFn fetches queryKey[0] only — multi-segment keys silently hit the list endpoint

## Problem

The app's default TanStack Query function (`getQueryFn` in `client/src/lib/queryClient.ts`) builds the fetch URL from **`queryKey[0]` only** and ignores every later key segment. Any `useQuery` that relies on this default and passes a **multi-segment key** like `["/api/campaigns", id]` therefore fetches the *base/list* endpoint (`/api/campaigns`) instead of the intended *detail* endpoint. The list endpoint returns **200 OK with wrong-shaped data**, so nothing throws and the failure is invisible at runtime.

The app's convention is that query keys are single strings that *are* the URL. A handful of sites broke that convention and produced two distinct, silent failures — one of them high-severity data loss.

## Symptoms

1. **Config clobber (data loss, high).** The Configure-campaign dialog used `useQuery(["/api/campaigns", id])`. It received the campaigns *array*, so `fullCampaign.config` was `undefined`. The editor's `useEffect` fell back to `DEFAULT_CAMPAIGN_CONFIG`, and **saving overwrote the campaign's real stored config** — wiping custom labels and external-link settings. Reproduced on dev: editing `minVotes` wiped `showExternalLinks` / `linkTemplate` (confirmed by querying the dev DB directly).
2. **Analytics blank sections.** The four analytics detail queries used `["/api/analytics/campaigns", id, "<section>"]` with no explicit `queryFn`. Each fetched `/api/analytics/campaigns` (the list), got the wrong shape, and rendered **blank tabs** (votes / reviewers / disagreements / skips).

Both: no console error, no failed request, HTTP 200 throughout.

## What Didn't Work

Before anyone read `getQueryFn`, the investigation chased plausible but wrong culprits — all disproven by tracing the actual code path:

- **Stale-cache / invalidation hypothesis (the first guess).** The app runs `staleTime: Infinity` with no auto-refetch, and the config-save mutation invalidates with the prefix `["/api/campaigns"]`. The theory was that prefix invalidation didn't cover the detail key, or the `useEffect` got a stale value. Ruled out: prefix invalidation *does* cover multi-segment detail keys, and the bug reproduced even on a fresh open. *(session history)*
- **Missing Clerk session-token claim** — disproven; auth was fine and requests returned 200.
- **Server-side HTML sanitizer mangling the value** — disproven; the client parsed/submitted the value correctly.
- **nginx WAF stripping payloads** — disproven; no WAF in the path, and the server stored exactly what it received (`p.x || null`).

Tracing client → server confirmed the value round-tripped fine, which redirected attention to the *read* side and `getQueryFn`'s `const url = queryKey[0] as string`.

## Solution

Fix at the **call sites**: use a single-string key that *is* the detail URL, so `queryKey[0]` resolves correctly. This was preferred over changing `getQueryFn` to join segments globally — riskier, because other keys legitimately carry non-URL cache-discriminator segments (e.g. filter objects) that must not be appended to the URL.

**`client/src/pages/admin/campaigns.tsx` — Configure dialog**

```ts
// Before — hits the LIST endpoint, drops the id:
queryKey: ["/api/campaigns", campaign.id],

// After — single-string key resolves to the DETAIL endpoint:
queryKey: [`/api/campaigns/${campaign.id}`],
```

The defensive `useEffect` that zod-parses the loaded config and falls back to the default was **kept** intact:

```ts
const parsed = campaignConfigSchema.safeParse(fullCampaign?.config);
setConfig(parsed.success ? parsed.data : DEFAULT_CAMPAIGN_CONFIG);
```

**`client/src/pages/admin/analytics.tsx` — 4 detail queries** (votes/reviewers/disagreements/skips)

```ts
// Before — no queryFn, so the default fetches "/api/analytics/campaigns" (list):
queryKey: ["/api/analytics/campaigns", selectedCampaign, "votes"],

// After — single-string key hits the per-campaign detail endpoint:
queryKey: [`/api/analytics/campaigns/${selectedCampaign}/votes`],
```

## Why This Works

`getQueryFn` does `const url = queryKey[0] as string` and fetches exactly that. Moving the id into `queryKey[0]` as an interpolated single-string URL makes the default fetcher request the detail endpoint, and TanStack Query still gets a unique cache key per id (the URL string differs per resource). No change to the shared fetcher is needed, so keys elsewhere that carry non-URL discriminator segments *alongside an explicit `queryFn`* are unaffected.

## Prevention

**1. Dev-time guard in `getQueryFn`** (`client/src/lib/queryClient.ts`) — surfaces any future multi-segment key that falls through to the default fetcher, so the footgun is loud instead of silent:

```ts
if (import.meta.env.DEV && queryKey.length > 1) {
  console.warn(
    `[queryClient] Query key ${JSON.stringify(queryKey)} has >1 segment but no explicit queryFn; ` +
      `only queryKey[0] ("${String(queryKey[0])}") is fetched. Use a single-string key or an explicit queryFn.`,
  );
}
const url = queryKey[0] as string;
```

**2. Precise audit predicate.** The bug manifests **only** for a *multi-segment key with NO explicit `queryFn`* (it falls through to the default). Keys with an inline `queryFn` are safe even when multi-segment — e.g. `results.tsx` uses `["/api/campaigns", id, "results", {...}]` *with* a `queryFn` and is correct. A naive "any `[base, id]` key" grep over-flags those safe sites; intersect the two conditions:

```bash
# Candidate offenders: multi-segment queryKey, then exclude any block with a queryFn.
grep -rEn 'queryKey:\s*\[[^]]*,[^]]*\]' client/src --include='*.tsx' -A6 | grep -v 'queryFn'
# Manually confirm each hit. (This audit found the 4 analytics queries; results.tsx was
# correctly excluded because each query supplies its own queryFn.)
```

**3. Regression tests** (`client/src/lib/queryClient.test.ts`) lock in both the correct single-string behavior and the documented footgun + warning:

```ts
it("fetches a single-string key as the URL (detail endpoint)", async () => {
  const fn = getQueryFn({ on401: "returnNull" });
  await fn({ queryKey: ["/api/campaigns/abc-123"] } as any);
  expect(fetch).toHaveBeenCalledWith("/api/campaigns/abc-123", expect.objectContaining({ credentials: "include" }));
});

it("drops extra key segments and warns (documents the footgun)", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const fn = getQueryFn({ on401: "returnNull" });
  await fn({ queryKey: ["/api/campaigns", "abc-123"] } as any);
  expect(fetch).toHaveBeenCalledWith("/api/campaigns", expect.objectContaining({ credentials: "include" }));
  expect(warn).toHaveBeenCalledOnce();
});
```

**Rule of thumb:** with this `getQueryFn`, a query key is either a **single string that is the URL**, or it carries an **explicit `queryFn`**. Never a multi-segment key relying on the default fetcher.

## Related Issues

- **Sequel / side effect:** [`single-string-querykey-escapes-list-prefix-invalidation-2026-06-02.md`](single-string-querykey-escapes-list-prefix-invalidation-2026-06-02.md) — the single-string-key fix below removed this query from `["/api/campaigns"]` list-prefix invalidation coverage, so under `staleTime: Infinity` the Configure dialog reopened stale. The "stale-cache hypothesis" ruled out above was correct for the *multi-segment* key, but the fix flipped it true. Re-validate "ruled out" notes when the code they describe changes.
- QA findings: `docs/qa/2026-05-29-generalization-ui-qa-checklist.md` — finding **#5** (config clobber) and **#12** (analytics blank sections, same root cause).
- Plan: `docs/plans/2026-06-01-001-fix-campaign-config-ux-plan.md` (Unit 1 + Unit 6).
- Fix commits: `0f21dec` (config editor + dev guard + tests), `86bde0d` (analytics queries). Shipped in PR #8 (merge `68ccc06`).
