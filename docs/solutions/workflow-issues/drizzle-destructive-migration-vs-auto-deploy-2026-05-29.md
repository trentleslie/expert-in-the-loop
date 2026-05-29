---
title: "Run destructive Drizzle migrations manually before the auto-deploy restarts the service"
date: 2026-05-29
category: workflow-issues
module: deployment + database migrations
problem_type: workflow_issue
component: development_workflow
severity: high
related_components:
  - database
applies_when:
  - "A schema change is destructive (enum→text, DROP TYPE, drop a constraint, column type change)"
  - "Pushing/merging to a branch that GitHub Actions auto-deploys (dev or main)"
  - "Single-instance Lightsail host where the app and DB share a maintenance window"
tags: [drizzle, db-push, migration, deployment, github-actions, lightsail]
---

# Run destructive Drizzle migrations manually before the auto-deploy restarts the service

## Context

This repo auto-deploys on push: merging to `dev` (and `main`) triggers a GitHub Actions workflow (`deploy-dev.yml` / `deploy.yml`) that SSHes to the Lightsail box, `git pull`s, runs `npm ci && npm run build`, and **restarts the systemd service**. Critically, the workflow does **not** run `npm run db:push` or any hand-written SQL — schema changes are applied to the database manually (per `CLAUDE.md`).

So when a PR carries a destructive schema change (here: `pair_type` enum→text, `DROP TYPE`, dropping the `votes(pairId,userId)` unique constraint, plus new NOT-NULL columns), **merging it auto-deploys code that references a schema the database does not have yet**. The service restarts onto the new code while the DB is still on the old schema → every query referencing the new columns/changed types fails (e.g. `castVote`'s supersession inserts would also hit the not-yet-dropped unique constraint). The environment is hard-down until the migration is run.

The trap: "merge" and "deploy the schema" feel like one action, but the auto-deploy only does the *code* half. (Project pipeline context: dev runs at `dev.expertintheloop.io` as the staging tier — auto memory [claude].)

## Guidance

Treat a destructive schema change as a **maintenance-window operation on the box, sequenced before the service comes back up** — not something the merge/auto-deploy performs. Run the DB migration first, verify, then let the deploy (or merge) restart the service against the already-migrated DB.

Authoritative sequence (dev shown; substitute prod names for `expertloop`):

```bash
ssh -i ~/.ssh/lightsail-expert.pem ubuntu@35.161.242.62
cd ~/expert-in-the-loop-dev

sudo systemctl stop expert-in-the-loop-dev                 # close the window first
pg_dump -U expertuser -h localhost -Fc expertloop_dev > ~/pre_migration.dump

git fetch origin && git checkout <feature-branch>          # get scripts + new schema.ts BEFORE merge
npm ci
psql -U expertuser -h localhost -d expertloop_dev -f scripts/migration-001-*.sql   # destructive SQL
set -a; source .env; set +a                                 # db:push reads DATABASE_URL from env
npm run db:push                                             # confirm ONLY additive ADD COLUMN/CREATE
psql -U expertuser -h localhost -d expertloop_dev -f scripts/migration-002-*.sql   # data step
npm run build
sudo systemctl start expert-in-the-loop-dev
```

Only after the box is migrated + verified do you merge the PR (which fast-forwards the auto-deploy onto the same, now-DB-ready code).

## Why This Matters

`drizzle-kit push` is destructive and interactive — it can't run unattended in CI, and it can't safely do enum→text or constraint drops (which is why those live in hand-written idempotent SQL). Because the deploy pipeline restarts the service but never touches the DB, the *ordering* of "migrate DB" vs "restart on new code" is the whole ballgame. Get it backwards and the running environment breaks the instant the deploy finishes. This recurs on **every** destructive change and on the prod promotion.

Two supporting design choices that make the window safe:
- Hand-written SQL for destructive steps (`migration-001`), `db:push` only for additive columns, with a pre-push additivity check (drizzle-kit has no true dry-run; verify against a scratch DB or eyeball `--strict --verbose`).
- A `pg_dump` taken *before* the first irreversible step is the real rollback once any new-model write has occurred.

## When to Apply

- Any enum→text, `DROP TYPE`, dropped/added constraint, or column-type change.
- Adding NOT-NULL columns the new code reads (additive, but the code still needs them present before restart).
- Promoting the same change from `dev` to `main`/prod (run the identical sequence on `expertloop` in its own window).

## Examples

**Wrong:** Merge the schema PR to `dev` → auto-deploy pulls + builds + restarts → app boots on new code against old DB → 500s on every campaign/pair/vote query → dev down until someone SSHes in and migrates.

**Right (what we did):** Stop dev service → `pg_dump` → checkout the feature branch on the box → run `migration-001.sql` → `db:push` (additive only) → `migration-002-archive-existing.sql` → build → start → verify (`\d pairs`/`\d votes`/`\d campaigns`, smoke-test create/import/vote/results) → *then* merge the PR. Auto-deploy redeploys the same code onto the migrated DB and comes up green (HTTP 200).

## Related

- GitHub issue [#2 — "switch from db:push to Drizzle migration files"](https://github.com/trentleslie/expert-in-the-loop/issues/2): the tracked long-term fix. Versioned migration files run in CI would remove this manual-ordering hazard; until then, the manual maintenance-window sequence above is the workaround.
- [drizzle-zod widens jsonb $type discriminated unions](../build-errors/drizzle-zod-jsonb-type-widening-2026-05-29.md) — same `shared/schema.ts` / `db:push` surface.
- `docs/solutions/best-practices/clerk-auth-migration-express-react-2026-05-06.md` — "test on `expertloop_dev` first, then prod" precedent (covers auth/user-ID migration, not schema migration).
- `CLAUDE.md` → Deployment / "Schema changes: `npm run db:push` must be run manually … on each database."
