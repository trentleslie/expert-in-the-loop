-- migration-004-partition-scoring.sql
-- Partition scoring mode — reviewers group a pair's member variables into distinct
-- concepts instead of casting a single binary/numeric score. Two schema changes:
--   1. a new `partition` value on the scoring_mode enum, and
--   2. an additive `score_partition` jsonb column on votes (the reviewer's grouping).
--
-- Run order: apply this BEFORE the new code goes live (a partition campaign cannot be
-- created until the enum accepts 'partition'). The jsonb column is additive and is also
-- created by `npm run db:push`; this file makes both changes explicit + idempotent.
--
-- IMPORTANT (Postgres): `ALTER TYPE ... ADD VALUE` CANNOT run inside a transaction block,
-- and the newly added value is not usable in the SAME transaction. Run this file with
-- autocommit (e.g. `psql "$DATABASE_URL" -f scripts/migration-004-partition-scoring.sql`),
-- NOT wrapped in BEGIN/COMMIT. Apply to prod (expertloop) AND dev (expertloop_dev).
--
-- Idempotent — safe to re-run (ADD VALUE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS).

ALTER TYPE scoring_mode ADD VALUE IF NOT EXISTS 'partition';

ALTER TABLE votes ADD COLUMN IF NOT EXISTS score_partition jsonb;
