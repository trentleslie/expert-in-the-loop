-- migration-005-exclusion-scoring.sql
-- Exclusion scoring mode — reviewers flag a pair's member variables that do NOT
-- belong to the concept (checkbox per member) instead of casting a single
-- binary/numeric score. A lower-friction sibling of the "partition" mode. Two
-- schema changes:
--   1. a new `exclusion` value on the scoring_mode enum, and
--   2. an additive `score_exclusion` jsonb column on votes (the flagged member ids).
--
-- Run order: apply this BEFORE the new code goes live (an exclusion campaign cannot
-- be created until the enum accepts 'exclusion'). The jsonb column is additive and is
-- also created by `npm run db:push`; this file makes both changes explicit + idempotent.
--
-- IMPORTANT (Postgres): `ALTER TYPE ... ADD VALUE` CANNOT run inside a transaction
-- block, and the newly added value is not usable in the SAME transaction. Run this file
-- with autocommit (e.g. `psql "$DATABASE_URL" -f scripts/migration-005-exclusion-scoring.sql`),
-- NOT wrapped in BEGIN/COMMIT. Apply to prod (expertloop) AND dev (expertloop_dev).
--
-- NOTE: numbered 005 (not 004) so it does not collide with the partition mode's
-- migration-004 — both add an independent value to the same enum via ADD VALUE IF NOT
-- EXISTS, so applying both in either order is safe.
--
-- Idempotent — safe to re-run (ADD VALUE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS).

ALTER TYPE scoring_mode ADD VALUE IF NOT EXISTS 'exclusion';

ALTER TABLE votes ADD COLUMN IF NOT EXISTS score_exclusion jsonb;
