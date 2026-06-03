-- migration-003-backfill-campaign-memberships.sql
-- Reviewer Focus — one-time backfill of the campaign_memberships table so the
-- joined-first reviewer home isn't empty on rollout for existing reviewers.
--
-- Run order: AFTER the additive `npm run db:push` that creates the
-- campaign_memberships table, and BEFORE (or right as) the new code goes live.
-- Idempotent — safe to re-run (ON CONFLICT DO NOTHING against the
-- (campaign_id, user_id) composite unique).
--
-- What this does:
--   Seeds a membership row for each (active campaign, reviewer) pair where the
--   reviewer has at least one ACTIVE vote in that campaign. Votes use a
--   supersession chain (is_active / superseded_by), so we group by DISTINCT
--   (campaign_id, user_id) over is_active votes — never row counts. Restricted
--   to status='active' campaigns to match the active-only join guard + home
--   (no seeded-but-invisible memberships). votes has no campaign_id, so the
--   pairs join derives it.

BEGIN;

INSERT INTO campaign_memberships (id, campaign_id, user_id, joined_at)
SELECT gen_random_uuid(), p.campaign_id, v.user_id, now()
FROM votes v
JOIN pairs p ON p.id = v.pair_id
JOIN campaigns c ON c.id = p.campaign_id
WHERE v.is_active = true
  AND c.status = 'active'
GROUP BY p.campaign_id, v.user_id
ON CONFLICT (campaign_id, user_id) DO NOTHING;

COMMIT;

-- Verification (manual — see the plan's Unit 3):
--   -- membership rows must equal the distinct active-vote (campaign,user) pairs
--   -- for active campaigns:
--   SELECT count(*) FROM campaign_memberships;
--   SELECT count(*) FROM (
--     SELECT DISTINCT p.campaign_id, v.user_id
--     FROM votes v
--     JOIN pairs p ON p.id = v.pair_id
--     JOIN campaigns c ON c.id = p.campaign_id
--     WHERE v.is_active = true AND c.status = 'active'
--   ) t;
--   -- Re-running this script must change nothing (idempotent).
