-- Backfill: campaign_memberships.role (owner / participant)
-- ---------------------------------------------------------------------------
-- DATA ONLY. The DDL (membership_role enum + campaign_memberships.role column)
-- is owned by shared/schema.ts and applied by `drizzle-kit push`. Do NOT add
-- CREATE TYPE / ADD COLUMN here — Postgres CREATE TYPE has no IF NOT EXISTS, and
-- running DDL from both schema.ts and this file throws "type already exists".
--
-- Prod runbook (hard ordering — prevents a reviewer lockout window):
--   1. `npm run db:push`   -> adds the column, DEFAULT 'participant' fills
--                             existing membership rows only.
--   2. psql -f THIS FILE   -> promotes creators to owner, adds participant rows
--                             for prior voters. Verify counts (see below).
--   3. Deploy app code that reads/enforces `role`.
--
-- Idempotent: safe to re-run. ON CONFLICT prevents duplicating rows or demoting
-- an owner.

BEGIN;

-- 2. Backfill owners from campaigns.created_by (idempotent)
--    a) promote existing membership rows whose user is the creator
UPDATE campaign_memberships m SET role = 'owner'
  FROM campaigns c WHERE m.campaign_id = c.id AND m.user_id = c.created_by;
--    b) insert an owner row for creators with no membership yet
INSERT INTO campaign_memberships (campaign_id, user_id, role)
  SELECT c.id, c.created_by, 'owner' FROM campaigns c
  ON CONFLICT (campaign_id, user_id) DO UPDATE SET role = 'owner';

-- 3. Backfill participants from prior voters (active OR superseded), excluding
--    skip-only users (a skip creates no vote row). Never demotes an owner.
INSERT INTO campaign_memberships (campaign_id, user_id, role)
  SELECT DISTINCT p.campaign_id, v.user_id, 'participant'
  FROM votes v JOIN pairs p ON p.id = v.pair_id
  ON CONFLICT (campaign_id, user_id) DO NOTHING;

COMMIT;

-- Verification (run after COMMIT; expect exactly one owner per campaign):
--   SELECT campaign_id,
--          count(*) FILTER (WHERE role = 'owner')       AS owners,
--          count(*) FILTER (WHERE role = 'participant') AS participants
--     FROM campaign_memberships GROUP BY campaign_id;
