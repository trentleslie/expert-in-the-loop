---
title: "Extending PATCH /api/campaigns/:id — an unconditional status guard 400s new body shapes, and a no-op UPDATE returns success on a missing id"
date: 2026-06-18
category: logic-errors
module: "Campaigns API (server/routes.ts, server/storage.ts)"
problem_type: logic_error
component: rails_controller  # Rails-oriented enum; real component is the Express PATCH route handler + Drizzle storage layer
severity: high
symptoms:
  - "Editing a campaign's name/description/instructions returns 400 {\"message\":\"Invalid status\"} — the status-enum guard rejects every details-only body because it carries no `status` field"
  - "PATCHing a non-existent / deleted campaign id returns 200 {\"success\":true} while updating zero rows — the UI reports success for an edit that never happened"
root_cause: logic_error
resolution_type: code_fix
related_components:
  - express-route-handler
  - drizzle-orm
tags:
  - express
  - drizzle-orm
  - patch-route
  - request-validation
  - body-shape-dispatch
  - silent-no-op
  - existence-check
  - 404-handling
---

# Extending PATCH /api/campaigns/:id — unconditional guard blocks new shapes, and a no-op UPDATE reports success

## Problem

Extending the admin-only `PATCH /api/campaigns/:id` route from status-only to also accept `name`/`description`/`instructions` introduced two silent-failure logic errors: an unconditional `status` enum guard that ran *before* any branching (so it rejected every details-only body), and a Drizzle `UPDATE … WHERE id=` that returns `{ success: true }` even when no row matches the id.

## Symptoms

- A details edit (body with no `status`) returned `400 {"message":"Invalid status"}` — the new feature never worked.
- A PATCH against a deleted or wrong/stale id returned `200 {"success":true}` but changed nothing in the database — success reported for a row that didn't exist.

## What Didn't Work

This bug family nearly shipped at three separate review layers — useful as a record of how easily it hides:

- **The naive extension** kept the existing guard and bolted on a details branch beside it:

  ```ts
  app.patch("/api/campaigns/:id", requireAdmin, async (req, res) => {
    const { status, name, description, instructions } = req.body;

    // ❌ unconditional — runs for EVERY request, including details-only edits
    if (!["draft", "active", "completed", "archived"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    if (name) { /* never reached for a details-only body */ }
    await storage.updateCampaignStatus(req.params.id, status);
    res.json({ success: true });
  });
  ```

  A details-only body has `status === undefined`, fails `.includes()`, and 400s before the `if (name)` branch is evaluated. (Plan-level review caught this one *before* implementation — three independent reviewers converged on the "dispatch hazard.") (session history)
- **A first code-review pass** caught a related partial-update data-loss: the details Zod schema initially coerced omitted fields to `null` (`.optional().default(null)`), so a `{name}`-only PATCH would have wiped `description`/`instructions`. Fixed by keeping omitted fields `undefined` and only writing present fields. (session history)
- **The no-op-update → fake-success gap** was missed by plan review, the code-review pass, and the 78-test suite; it only surfaced in a Greptile review of the combined release diff. (session history)

## Solution

**1. Dispatch on body shape; keep the status check inside its branch.**

Before:

```ts
const { status } = req.body;
if (!["draft", "active", "completed", "archived"].includes(status)) {
  return res.status(400).json({ message: "Invalid status" });
}
await storage.updateCampaignStatus(req.params.id, status);
res.json({ success: true });
```

After (`server/routes.ts`, the `PATCH /api/campaigns/:id` handler):

```ts
const body = (req.body ?? {}) as Record<string, unknown>;
const hasStatus = body.status !== undefined;
const hasDetails = ["name", "description", "instructions"].some((k) => body[k] !== undefined);

if (hasStatus && hasDetails) {
  return res.status(400).json({ message: "Update either status or details, not both" });
}

if (hasStatus) {
  const { status } = body as { status: unknown };
  if (typeof status !== "string" || !["draft", "active", "completed", "archived"].includes(status)) {
    return res.status(400).json({ message: "Invalid status" });   // now scoped to the status branch
  }
  await storage.updateCampaignStatus(req.params.id, status as Campaign["status"]);
  return res.json({ success: true });
}

if (hasDetails) {
  const parsed = updateCampaignDetailsSchema.safeParse(body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid campaign details", errors: parsed.error.flatten() });
  }
  await storage.updateCampaignDetails(req.params.id, parsed.data);
  return res.json({ success: true });
}

return res.status(400).json({ message: "No updatable fields provided" });  // empty body
```

**2. Existence check before the no-op UPDATE.**

`storage.updateCampaignDetails` issues `db.update(campaigns).set(...).where(eq(campaigns.id, id))`, which matches zero rows on a bad id and resolves without error. The handler now guards with a `getCampaign` lookup first — mirroring the sibling `PUT /api/campaigns/:id/config`, which already did this — so a miss surfaces as 404 instead of fake success, covering both branches:

```ts
// at the top of the PATCH handler's try block
const existing = await storage.getCampaign(req.params.id);
if (!existing) {
  return res.status(404).json({ message: "Campaign not found" });
}
```

The storage method also writes an explicit column allowlist (`name`/`description`/`instructions` only), never a spread of the request body — so the new edit path can't mass-assign server-managed columns (`status`, `config`, `campaignType`, `createdBy`).

## Why This Works

Both failures share one root cause: assumptions that were safe for a single-purpose handler became wrong once the handler took on a second responsibility.

- The `status` guard was a *handler precondition* when status was the only operation. Adding a second body shape turned it into an unconditional gate that rejected the new shape. The fix re-scopes validation to the operation it validates: branch on what the caller is doing, then validate *inside* that branch.
- `UPDATE … WHERE id = ?` is defined to affect zero-or-more rows; "zero rows" is a normal outcome the ORM does not raise. Returning `{ success: true }` conflates "the statement ran" with "the target existed and changed." An explicit existence check converts a meaningless success into an honest 404.

## Prevention

- **When multiplexing one endpoint over multiple operations, branch on body shape first, then keep each operation's validation inside its own branch.** Never leave a single-purpose guard at the top where it silently becomes a precondition on shapes it was never meant to judge.
- **Reject ambiguous and empty bodies explicitly** (both-present → 400, neither-present → 400) so callers get a clear contract instead of falling through.
- **Add an existence check before any mutation whose ORM no-ops on a miss.** A bare `UPDATE … WHERE id` does not error on a non-existent id; don't let "statement executed" stand in for "record changed."
- **Mirror the 404 pattern of sibling handlers on the same resource** (here, `PUT /api/campaigns/:id/config` already did `getCampaign` → 404) so the resource behaves consistently across routes.
- **Allowlist columns in the storage layer** rather than spreading the request body, to prevent mass-assignment through a new edit path.
- **Tests with a stubbed storage layer won't catch the no-op-success gap** — it depends on real "WHERE matches zero rows" semantics. Cover missing-id with an integration-style test or an explicit existence-check assertion.

## Related Issues

Client-side counterparts on the same campaign Configure-dialog feature surface (different layer — cache/fetch, not route validation):

- [`getqueryfn-querykey-footgun-2026-06-01.md`](getqueryfn-querykey-footgun-2026-06-01.md) — a multi-segment queryKey hits the list endpoint instead of the detail endpoint.
- [`single-string-querykey-escapes-list-prefix-invalidation-2026-06-02.md`](single-string-querykey-escapes-list-prefix-invalidation-2026-06-02.md) — cache staleness after a campaign save because a single-string detail key escapes list-prefix invalidation.

Introduced in commit `a024776` (dispatch restructure) and `e17533d` (404 existence check); shipped via PRs #19 / #21 / #22.
