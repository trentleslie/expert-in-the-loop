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
--   4. ALTER the five users.id foreign keys to ON UPDATE CASCADE so the Clerk
--      auth ID-migration can re-point child rows instead of FK-violating
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

-- 4: make every users.id foreign key ON UPDATE CASCADE so the Clerk auth
-- ID-migration (`UPDATE users SET id = <clerkId>` in storage.updateUserId) can
-- re-point child rows instead of FK-violating. Without this, any user who owns
-- rows (i.e. all real users) gets a 500 on first Clerk login and cannot
-- authenticate. The matching `onUpdate:"cascade"` is in shared/schema.ts so a
-- later `db:push` sees no constraint drift. Idempotent: constraints already set
-- to CASCADE (confupdtype = 'c') are skipped; the FK is looked up by
-- (table, column) so a non-default constraint name is still handled.
DO $$
DECLARE
  con_names text[];
  upd_types "char"[];
  tbl text;
  col text;
  pairs_arr text[] := ARRAY[
    'campaigns:created_by',
    'votes:user_id',
    'allowed_domains:added_by',
    'skipped_pairs:user_id',
    'import_templates:created_by'
  ];
  entry text;
BEGIN
  FOREACH entry IN ARRAY pairs_arr LOOP
    tbl := split_part(entry, ':', 1);
    col := split_part(entry, ':', 2);

    -- Gather EVERY FK on (tbl.col) -> users.id. Expect exactly one. A plain
    -- `SELECT INTO` would silently take the first on duplicates, so aggregate
    -- and check: >1 means a prior aborted attempt left a stale constraint —
    -- fail loudly rather than CASCADE-ing only one; 0 means absent (skip).
    SELECT array_agg(conname), array_agg(confupdtype)
      INTO con_names, upd_types
    FROM pg_constraint
    WHERE conrelid = tbl::regclass
      AND contype = 'f'
      AND confrelid = 'users'::regclass
      AND conkey = (
        SELECT array_agg(attnum)
        FROM pg_attribute
        WHERE attrelid = tbl::regclass AND attname = col
      );

    IF con_names IS NULL THEN
      CONTINUE;  -- no such FK (unexpected); nothing to alter
    ELSIF array_length(con_names, 1) > 1 THEN
      RAISE EXCEPTION
        'Multiple FK constraints on %.% -> users.id (%); resolve the duplicate before migrating',
        tbl, col, con_names;
    END IF;

    -- Exactly one. Skip if it is already ON UPDATE CASCADE (idempotent re-run).
    IF upd_types[1] <> 'c' THEN
      EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', tbl, con_names[1]);
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES users(id) ON UPDATE CASCADE',
        tbl, con_names[1], col
      );
    END IF;
  END LOOP;
END $$;

COMMIT;

-- Post-conditions (manual verification — see the plan's Unit 1 Verification):
--   \d pairs   -> pair_type is `text`, not the pair_type enum
--   \d votes   -> no unique constraint on (pair_id, user_id)
--   \d campaigns / votes / allowed_domains / skipped_pairs / import_templates
--             -> the users.id FK reads "ON UPDATE CASCADE"
--   SELECT COUNT(*) FROM pairs / votes  -> unchanged from pre-migration counts
