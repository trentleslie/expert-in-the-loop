---
title: "Campaign-access backfill: Postgres enum literal coerced to text in INSERT ... SELECT DISTINCT"
date: 2026-07-22
category: database-issues
module: campaign_access_roles_backfill
problem_type: database_issue
component: database
symptoms:
  - 'ERROR: column "role" is of type membership_role but expression is of type text'
  - "Fails only on the participant INSERT ... SELECT DISTINCT step; the owner steps succeed"
  - "Transaction rolls back cleanly but backfill populates nothing (campaigns_without_owner = all)"
root_cause: logic_error
resolution_type: migration
severity: high
related_components:
  - database
  - development_workflow
tags:
  - postgres
  - enum-coercion
  - select-distinct
  - backfill
  - membership-role
  - drizzle
  - campaign-access
---

# Campaign-access backfill: Postgres enum literal coerced to text in `INSERT ... SELECT DISTINCT`

## Problem

The `campaign_memberships.role` backfill (`scripts/backfill/0001_campaign_access_roles.backfill.sql`)
inserts bare enum string literals via `INSERT ... SELECT DISTINCT`. Postgres resolves the literal to
`text` and then refuses to coerce it into the `membership_role` enum column, so the whole script aborts.
Because the owner/participant access migration had already shipped its enforcing code to dev, the failed
backfill left **every campaign with zero owners** — an authorization-relevant data gap that looked like a
clean run unless you read the psql error.

## Symptoms

- Live Postgres error on the participant step:
  ```
  ERROR: column "role" is of type membership_role but expression is of type text
  LINE 2:   SELECT DISTINCT p.campaign_id, v.user_id, 'participant'
  ```
- The script is wrapped in `BEGIN;`/`COMMIT;`, so the error rolls the transaction back **cleanly** — no
  partial rows, no corruption — but nothing is inserted.
- Observable end state: `campaigns_without_owner` = every campaign, 0 owners, 0 backfilled participants.
  Silent unless the psql exit/error is read; the post-run verification query is what surfaced it.
- The unit suite stayed green throughout.

## What Didn't Work

The original **uncast** script — bare enum literals in all three steps:

```sql
BEGIN;
UPDATE campaign_memberships m SET role = 'owner'
  FROM campaigns c WHERE m.campaign_id = c.id AND m.user_id = c.created_by;

INSERT INTO campaign_memberships (campaign_id, user_id, role)
  SELECT c.id, c.created_by, 'owner' FROM campaigns c
  ON CONFLICT (campaign_id, user_id) DO UPDATE SET role = 'owner';

INSERT INTO campaign_memberships (campaign_id, user_id, role)   -- <-- FAILS HERE
  SELECT DISTINCT p.campaign_id, v.user_id, 'participant'
  FROM votes v JOIN pairs p ON p.id = v.pair_id
  ON CONFLICT (campaign_id, user_id) DO NOTHING;
COMMIT;
```

Why the bug hid until a live run:

- **The owner steps "worked," masking the defect.** `UPDATE ... SET role = 'owner'` uses an *assignment
  cast* (target type known), and `INSERT ... SELECT c.id, c.created_by, 'owner'` (no `DISTINCT`) keeps the
  literal as pseudo-type `unknown` and casts it straight to the enum. Neither errors — so literal-to-enum
  looks like it "just works" everywhere.
- **`DISTINCT` in the participant step is the actual trigger.** `SELECT DISTINCT` must dedupe rows, so
  Postgres resolves each projected expression to a concrete type *before* the insert, collapsing the bare
  literal from `unknown` to `text`. At insert time it then faces a `text → membership_role` implicit
  coercion, which Postgres does not provide. (`UNION`, `GROUP BY`, and CTE materialization do the same
  early-typing — any operator that sorts, dedupes, or compares the projected column.)
- **The green test proved nothing about the SQL.** `server/campaignBackfill.test.ts` is a pure-logic
  TypeScript *mirror* of the assignment rules (creator ⇒ owner, prior voter ⇒ participant). It never
  touches Postgres, so it cannot observe a type-resolution error and stayed passing while the real
  migration failed.

## Solution

Cast every enum literal explicitly to `::membership_role`, in all three steps including the
`ON CONFLICT DO UPDATE` (`fix/backfill-enum-cast`, PR #33):

```sql
UPDATE campaign_memberships m SET role = 'owner'::membership_role
  FROM campaigns c WHERE m.campaign_id = c.id AND m.user_id = c.created_by;

INSERT INTO campaign_memberships (campaign_id, user_id, role)
  SELECT c.id, c.created_by, 'owner'::membership_role FROM campaigns c
  ON CONFLICT (campaign_id, user_id) DO UPDATE SET role = 'owner'::membership_role;

INSERT INTO campaign_memberships (campaign_id, user_id, role)
  SELECT DISTINCT p.campaign_id, v.user_id, 'participant'::membership_role
  FROM votes v JOIN pairs p ON p.id = v.pair_id
  ON CONFLICT (campaign_id, user_id) DO NOTHING;
```

Re-running the corrected SQL on `expertloop_dev`: all 11 campaigns have exactly one owner,
`campaigns_without_owner = 0`, app healthy.

## Why This Works

- **`unknown` vs `text` literal resolution.** A bare quoted literal starts as the pseudo-type `unknown`,
  not `text`. In `UPDATE ... SET` and plain `INSERT ... VALUES/SELECT`, Postgres keeps it `unknown` (or
  uses an assignment cast) and coerces it directly to the target column type — so `'owner'` lands in a
  `membership_role` column fine.
- **`DISTINCT`/`UNION`/`GROUP BY`/CTE force early typing.** These operators compare/dedupe values, so
  Postgres resolves each projected expression to a concrete type before the row reaches the insert target.
  An untyped literal defaults to `text`, and there is no implicit `text → enum` cast — hence the error.
- **Explicit cast removes the ambiguity.** `'participant'::membership_role` makes the value the enum type
  up front, before `DISTINCT` and before the insert, so no implicit coercion is ever needed. The cast is
  harmless in the steps that already worked, so casting *all* literals is the uniform, safe fix.

## Prevention

- **Always cast enum literals in `INSERT`/`SELECT`** — mandatory whenever an operator sorts, dedupes, or
  compares the projected column (`DISTINCT`, `UNION`, `GROUP BY`, or a CTE boundary). Write
  `'value'::my_enum`; do not rely on implicit literal coercion, which silently works in some clauses and
  fails in others.
- **Validate migrations/backfills against a real Postgres, not a pure-logic mirror.** A TypeScript mirror
  test cannot catch a SQL type-resolution error. Add a path that executes the actual `.sql` against an
  ephemeral/throwaway Postgres (e.g. Testcontainers or a dev DB dry-run) in CI.
- **Enforce deploy ordering: migrate → backfill → verify before (or independently of) the code deploy.**
  `.github/workflows/deploy-dev.yml` auto-deploys code but skips `db:push` ("run manually when schema
  changes"), so enforcing code reached dev before the `role` column/backfill existed. Make the
  verification query (`campaigns_without_owner = 0`) a required go/no-go gate, not a post-hoc glance. See
  the related deploy-ordering doc below.
- **On the shared prod `expertloop` DB, apply DDL via `psql -f` (reviewed runbook), not `db:push`** — the
  shared DB also holds `kraken_*`/`session`/`alembic` tables that `db:push` could propose changing. The
  backfill file header encodes the hard ordering (column DEFAULT fill → `psql -f` backfill → verify counts
  → deploy enforcing code); follow it.

## Related Issues

- `docs/solutions/workflow-issues/drizzle-destructive-migration-vs-auto-deploy-2026-05-29.md` — same infra
  root: `deploy-dev.yml` ships code without running `db:push`, so schema-dependent code can down the env.
  Complements this doc's deploy-ordering prevention (not stale).
- `docs/solutions/database-issues/last-owner-invariant-nonatomic-count-then-delete-race-2026-07-22.md` —
  sibling bug on the same `membership_role` migration (a TOCTOU race on the ≥1-owner invariant).
- `docs/solutions/best-practices/blinded-ownership-participant-access-ui-2026-07-21.md` — the owner/
  participant access feature (UI/access layer) this migration supports.
- `docs/solutions/build-errors/drizzle-zod-jsonb-type-widening-2026-05-29.md` — kindred Drizzle/Postgres
  type-fidelity bug (a `$type` union widened at a write site).
- Shipped as PR #33 (`fix/backfill-enum-cast` → `dev`). No related GitHub issues found.
