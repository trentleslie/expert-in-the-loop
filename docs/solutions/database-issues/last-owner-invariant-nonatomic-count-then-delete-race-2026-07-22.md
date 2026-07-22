---
title: "Enforcing a ≥1-owner invariant with a count-then-delete check is a TOCTOU race — two concurrent removals both pass the guard and leave zero owners"
date: 2026-07-22
category: database-issues
module: "Campaign access authorization (server/storage.ts — removeCampaignParticipant)"
problem_type: database_issue
component: database
symptoms:
  - "Two owners removing each other (or themselves) concurrently both read owner count = 2, both pass the `owners <= 1` guard, and both deletes commit — the campaign ends with zero owners, violating the last-owner invariant"
  - "The invariant holds under any sequential test but fails only under concurrency; Greptile PR #31 P1 reproduced it with a runnable concurrent-deletion harness that logged both counts, both successful deletes, and the final zero-owner state"
root_cause: async_timing
resolution_type: code_fix
related_components:
  - drizzle-orm
  - postgresql
  - authentication
tags:
  - race-condition
  - toctou
  - check-then-act
  - transaction
  - select-for-update
  - row-lock
  - invariant-enforcement
  - concurrency
  - drizzle-orm
---

# Enforcing a ≥1-owner invariant with count-then-delete is a TOCTOU race

## Problem
A per-campaign authorization model (PR #31) gives each membership a role (`owner`/`participant`) and guards owner removal with a "never remove the last owner" invariant. The first cut read the owner count and then deleted in two separate statements. Under concurrency this is a check-then-act (TOCTOU) race: two owners removing each other at the same time each count two owners *before* either delete commits, both pass the `owners <= 1` guard, and both deletes succeed — leaving the campaign with **zero** owners, i.e. permanently unmanageable and inaccessible under its own route guards.

## Symptoms
- Owner count is correct at read time but stale by the time the delete runs.
- Invariant passes every sequential/unit test; only fails when two removals interleave.
- Reproduced by Greptile as a P1 with a concurrent-deletion harness whose log showed both requests counting 2 owners, both deletes committing, and a final zero-owner campaign.

## What Didn't Work
- **Application-level count-then-delete** (the original implementation) — reads and writes in separate, unserialized statements:
  ```ts
  // BEFORE — non-atomic: the count can be stale by the time the delete runs
  const membership = await this.getCampaignMembership(campaignId, userId);
  if (!membership) return { removed: false, reason: "not_found" };
  if (membership.role === "owner") {
    const owners = await this.countCampaignOwners(campaignId);
    if (owners <= 1) return { removed: false, reason: "last_owner" };
  }
  await db.delete(campaignMemberships)
    .where(and(eq(campaignMemberships.campaignId, campaignId),
               eq(campaignMemberships.userId, userId)));
  return { removed: true };
  ```
  Nothing prevents a second transaction from reading the same pre-delete count. Wrapping it in a plain transaction is **not** enough — under READ COMMITTED both transactions still see the old count and neither blocks the other.

## Solution
Serialize all membership mutations for a campaign behind a single, deterministic lock taken *before* the check. Take a `FOR UPDATE` row lock on the **parent campaign row** at the top of the transaction, then do the count-and-delete inside that same transaction:

```ts
// AFTER — check-and-delete serialized behind a FOR UPDATE lock on the parent campaign
async removeCampaignParticipant(campaignId: string, userId: string):
  Promise<{ removed: boolean; reason?: "last_owner" | "not_found" }> {
  return withTransactionRetry(() =>
    db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
      // Single deterministic lock point → serializes membership mutations, no deadlock
      await tx.execute(sql`SELECT 1 FROM ${campaigns} WHERE ${campaigns.id} = ${campaignId} FOR UPDATE`);

      const [membership] = await tx.select({ role: campaignMemberships.role })
        .from(campaignMemberships)
        .where(and(eq(campaignMemberships.campaignId, campaignId),
                   eq(campaignMemberships.userId, userId)));
      if (!membership) return { removed: false, reason: "not_found" as const };

      if (membership.role === "owner") {
        const [row] = await tx.select({ count: sql<number>`COUNT(*)::int` })
          .from(campaignMemberships)
          .where(and(eq(campaignMemberships.campaignId, campaignId),
                     eq(campaignMemberships.role, "owner")));
        if ((row?.count ?? 0) <= 1) return { removed: false, reason: "last_owner" as const };
      }

      await tx.delete(campaignMemberships)
        .where(and(eq(campaignMemberships.campaignId, campaignId),
                   eq(campaignMemberships.userId, userId)));
      return { removed: true };
    }),
  );
}
```

Key points:
- **Lock the parent, not the rows being counted.** Locking the single `campaigns` row is one deterministic lock point per campaign, so concurrent removals queue in a fixed order and cannot deadlock. Locking the individual membership rows would leave the acquisition order data-dependent (each request locks a *different* row first) and deadlock-prone.
- **Lock before you read the count.** The second remover blocks until the first commits, then re-reads the now-reduced owner count and is correctly refused with `last_owner`.
- **Bounded `lock_timeout` + `withTransactionRetry`** mirror the existing `castVote` path (`server/storage.ts`) so transient contention retries instead of failing the request hard, and a stuck lock can't hang the request forever.

## Why This Works
The race is a classic time-of-check-to-time-of-use gap: the guard's truth (owner count) can change between the `SELECT COUNT` and the `DELETE`. A plain transaction doesn't close the gap because READ COMMITTED lets both transactions read the pre-delete state concurrently. `SELECT ... FOR UPDATE` on the parent campaign forces every membership-mutating transaction for that campaign through a single serialization point: the second transaction cannot even *read* the count until the first has committed its delete and released the lock, so it observes the reduced count and honours the invariant. The lock scope is exactly "one campaign," so unrelated campaigns keep full concurrency.

## Prevention
- **Any invariant enforced by "read a count/state, then conditionally write" needs serialization, not just a transaction.** Treat check-then-act on a shared invariant as a race by default. The codebase already had the pattern in `castVote` (FOR UPDATE on the parent `pairs` row + `lock_timeout` + `withTransactionRetry`); reuse it rather than reinventing per-endpoint.
- **Lock the parent aggregate root once, deterministically.** For "at least N children with property X" invariants, take one `FOR UPDATE` lock on the parent row before the count, rather than locking the variable set of child rows (avoids data-dependent lock ordering and deadlocks).
- **Test invariants under concurrency, not just sequentially.** Sequential unit tests will always pass here. Add a concurrent-removal harness (two simultaneous deletes of the two remaining owners) that asserts a non-zero owner count survives — this is exactly what caught the bug.
- **Always pair the lock with a bounded `lock_timeout` and a retry wrapper** so contention degrades to a retry/timeout, never a hung request.

## Related Issues
- PR: https://github.com/trentleslie/expert-in-the-loop/pull/31 (feat: per-campaign access authorization) — Greptile P1 "Concurrent Deletes Remove Every Owner", fixed in commit `50c57e4`.
- Precedent pattern: `castVote` in `server/storage.ts` (FOR UPDATE on `pairs` + `lock_timeout` + `withTransactionRetry`).
- `docs/solutions/logic-errors/patch-campaigns-details-status-guard-and-noop-update-2026-06-18.md` — sibling learning from the same Campaigns storage/route surface (Drizzle `UPDATE ... WHERE id=` returns success on a non-existent id without an existence check).
