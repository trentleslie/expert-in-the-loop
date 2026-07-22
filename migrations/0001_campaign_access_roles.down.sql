-- Rollback: campaign_memberships.role (owner / participant)
-- ---------------------------------------------------------------------------
-- DEFAULT rollback = drop the column + enum only. Backfilled participant/owner
-- ROWS are intentionally RETAINED: without the `role` column they revert to the
-- pre-feature semantics ("focus association, not access control"), are harmless,
-- and reflect real participation.
--
-- Rollback ordering (avoid a 500 window and a silent re-add):
--   1. Revert the app code first (else it 500s selecting the missing column).
--   2. Run THIS FILE (DROP COLUMN / DROP TYPE).
--   3. Revert shared/schema.ts — otherwise the next `db:push` from an un-reverted
--      schema silently re-adds the column.
-- Simplest safe rollback = revert app code only and LEAVE the additive column in
-- place; it is inert without the enforcing code.

ALTER TABLE campaign_memberships DROP COLUMN IF EXISTS role;
DROP TYPE IF EXISTS membership_role;

-- Optional aggressive variant (NOT the default — would destroy valid focus rows
-- created by the backfill for reviewers who never clicked "join"):
--   DELETE FROM campaign_memberships cm
--     USING campaigns c
--     WHERE cm.campaign_id = c.id AND cm.user_id <> c.created_by
--       AND cm.joined_at >= '<backfill timestamp>';
