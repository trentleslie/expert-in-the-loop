-- migration-002-archive-existing.sql
-- Clean-slate cutover: archive all pre-cutover campaigns rather than migrating
-- them into the new evidence-tier model. The new model applies only to
-- campaigns created after this runs (see the plan's Overview).
--
-- This is the ENTIRE data migration for the generalization release. There is
-- intentionally NO evidence-status backfill, NO resolutionLayer inference, and
-- NO reclassification diff report — no live data is being reinterpreted.
--
-- New columns (evidenceStatus='unreviewed', resolutionLayer='unspecified',
-- votes.isActive=true, votes.supersededBy=null, campaigns.recomputeStatus='idle')
-- are populated on existing rows by their column DEFAULTs during the additive
-- `db:push` step that runs before this script.
--
-- Run order: AFTER Unit 1 SQL + the additive db:push, BEFORE service restart
-- (see the plan's Migration & Deploy Sequence). Idempotent.
--
-- "Read-only" for archived campaigns is ENFORCED by the server-side guards in
-- the vote / next-pair routes + storage (Units 4/5) — this status flag is the
-- signal those guards check, not the isolation mechanism by itself.

BEGIN;

-- Archive every campaign not already archived. campaignStatusEnum =
-- draft | active | completed | archived. Idempotent via the WHERE guard.
UPDATE campaigns
SET status = 'archived'
WHERE status <> 'archived';

COMMIT;

-- Verification (run manually after):
--   SELECT COUNT(*) FROM campaigns WHERE status <> 'archived';  -- 0 (pre-cutover)
--   SELECT COUNT(*) FROM votes WHERE is_active IS NULL;          -- 0
--   SELECT COUNT(*) FROM pairs
--     WHERE evidence_status IS NULL OR resolution_layer IS NULL; -- 0
--   SELECT COUNT(*) FROM campaigns WHERE recompute_status IS NULL; -- 0
