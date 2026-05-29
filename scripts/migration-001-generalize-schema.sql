-- migration-001-generalize-schema.sql
-- Campaign Model Generalization & Evidence Tiers — destructive schema changes
-- that drizzle-kit push cannot safely perform.
--
-- Run order (see docs/plans/2026-05-28-001-...): service stopped, AFTER pg_dump
-- backup, BEFORE the additive `db:push`. Idempotent — safe to re-run.
--
-- What this does:
--   1. pairs.pair_type: pair_type ENUM -> text (preserving existing values)
--   2. DROP TYPE pair_type (no longer referenced)
--   3. DROP the unique constraint on votes(pair_id, user_id) so a pair/user can
--      have multiple vote rows (immutable votes + supersession chain)
--
-- NOTE: scoring_mode is intentionally NOT changed — multi_criteria is deferred
--       (trentleslie/expert-in-the-loop#5), so the enum keeps binary/numeric.
-- NOTE: skipped_pairs.unique(pair_id, user_id) is intentionally RETAINED — skips
--       are legitimately one-per-user-pair and are never superseded.

BEGIN;

-- 1 + 2: pair_type enum -> text, then drop the now-unused enum type.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'pairs'
      AND column_name = 'pair_type'
      AND udt_name = 'pair_type'      -- still the enum type
  ) THEN
    ALTER TABLE pairs
      ALTER COLUMN pair_type TYPE text USING pair_type::text;
  END IF;

  -- Drop the enum type only once nothing references it anymore.
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pair_type') THEN
    DROP TYPE pair_type;
  END IF;
END $$;

-- 3: drop the unique constraint on votes(pair_id, user_id).
-- Drizzle's default name for `unique().on(pairId, userId)` is
-- votes_pair_id_user_id_unique; look it up defensively in case it differs.
DO $$
DECLARE
  con_name text;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'votes'::regclass
    AND contype = 'u'
    AND conkey = (
      SELECT array_agg(attnum ORDER BY attnum)
      FROM pg_attribute
      WHERE attrelid = 'votes'::regclass
        AND attname IN ('pair_id', 'user_id')
    );

  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE votes DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

COMMIT;

-- Post-conditions (manual verification — see the plan's Unit 1 Verification):
--   \d pairs   -> pair_type is `text`, not the pair_type enum
--   \d votes   -> no unique constraint on (pair_id, user_id)
--   SELECT COUNT(*) FROM pairs / votes  -> unchanged from pre-migration counts
