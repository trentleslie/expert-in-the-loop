-- migration-001-rollback.sql
-- Reverses migration-001-generalize-schema.sql.
--
-- *** HARD EXPIRY ***
-- This rollback is ONLY valid before the first vote supersession. Once any pair
-- has more than one row per (pair_id, user_id) — which happens the first time a
-- reviewer edits a vote under the new code — re-adding the UNIQUE constraint will
-- FAIL. After that point the recovery path is: restore from the pre-migration
-- pg_dump backup (acceptable under the clean-slate decision — existing campaigns
-- are archived, not live).
--
-- This script aborts with a clear message if duplicate active votes already exist.

BEGIN;

-- Guard: refuse to run if supersession has already produced duplicate rows.
DO $$
DECLARE
  dup_count integer;
BEGIN
  SELECT COUNT(*) INTO dup_count
  FROM (
    SELECT pair_id, user_id
    FROM votes
    GROUP BY pair_id, user_id
    HAVING COUNT(*) > 1
  ) d;

  IF dup_count > 0 THEN
    RAISE EXCEPTION
      'Rollback aborted: % (pair_id, user_id) groups already have multiple vote rows. '
      'Supersession has occurred; the unique constraint cannot be re-added. '
      'Recover by restoring the pre-migration pg_dump backup instead.', dup_count;
  END IF;
END $$;

-- 1: recreate the pair_type enum with its original values.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pair_type') THEN
    CREATE TYPE pair_type AS ENUM ('questionnaire_match', 'loinc_mapping');
  END IF;
END $$;

-- 2: convert pairs.pair_type text -> pair_type enum.
--    Any text value not in the original enum set will cause this to fail
--    (expected — those are post-generalization values that have no enum slot).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pairs' AND column_name = 'pair_type' AND udt_name = 'text'
  ) THEN
    ALTER TABLE pairs
      ALTER COLUMN pair_type TYPE pair_type USING pair_type::pair_type;
  END IF;
END $$;

-- 3: re-add the unique constraint (guarded above).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'votes'::regclass AND contype = 'u'
      AND conname = 'votes_pair_id_user_id_unique'
  ) THEN
    ALTER TABLE votes
      ADD CONSTRAINT votes_pair_id_user_id_unique UNIQUE (pair_id, user_id);
  END IF;
END $$;

COMMIT;
