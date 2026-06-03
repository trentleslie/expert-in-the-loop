---
title: "Prod cutover — day-of command card"
type: ops
status: active
date: 2026-06-03
companion: docs/plans/2026-06-02-001-ops-prod-promotion-runbook-plan.md
---

# Prod cutover — day-of command card

Copy-paste command companion to the runbook (rationale + risks live there). Every command below was exercised in the 2026-06-03 dry-run against a restored prod copy. **Gates are 🟢/🛑 — do not pass a 🛑.**

- **Box:** `ssh -i ~/.ssh/lightsail-expert.pem ubuntu@35.161.242.62`
- **Prod app:** `~/expert-in-the-loop` · service `expert-in-the-loop` · DB `expertloop` · port 5000
- **Promoting:** `origin/dev` → `main`

## Pre-flight (before stopping anything)

```bash
# From LOCAL — manual point-in-time instance snapshot (retained until deleted)
aws lightsail create-instance-snapshot \
  --instance-name expert-in-the-loop-upgraded \
  --instance-snapshot-name pre-cutover-$(date -u +%Y%m%d)

# On the BOX — confirm prod users all fall in the two-domain allowlist
cd ~/expert-in-the-loop && set -a && source .env && set +a
psql "$DATABASE_URL" -tAc "SELECT email FROM users WHERE email NOT LIKE '%@phenomehealth.org' AND email NOT LIKE '%@buckinstitute.org';"   # 🟢 expect 0 rows

# Pause the hourly pg_dump cron so it can't capture a half-migrated DB
crontab -l > /tmp/crontab.bak && crontab -l | grep -v db-backup.sh | crontab -
```
- [ ] Reviewer notice sent (window time; "you'll be signed out, sign back in via the same Google/Microsoft account; your account is preserved; campaigns you were working in are now read-only").
- [ ] Window avoids 06:00 UTC (auto-snapshot).

## Unit 4 — the cutover (irreversible)

```bash
cd ~/expert-in-the-loop && set -a && source .env && set +a

# 1. Stop + prevent auto-resurrect
sudo systemctl stop expert-in-the-loop
sudo systemctl mask expert-in-the-loop          # only if unit has Restart=always
ss -ltnp | grep :5000 || echo "🟢 nothing on :5000"

# 2. Pre-migration dump (service stopped) — the rollback anchor
mkdir -p ~/backups/db/manual
sudo -u postgres pg_dump -Fc expertloop > ~/backups/db/manual/expertloop-pre-cutover-$(date -u +%Y%m%d-%H%M%SZ).dump
ls -lh ~/backups/db/manual/expertloop-pre-cutover-*.dump   # 🟢 ~1.3 MB

# 3. Put the box's working tree at the code being promoted (stays on main branch)
git fetch origin
git checkout main && git reset --hard origin/dev
npm ci

# 4. migration-001 (destructive, idempotent): pair_type→text, drop votes-unique, +ON UPDATE CASCADE
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/migration-001-generalize-schema.sql   # 🟢 BEGIN…COMMIT, no error

# 5. db:push — ASSERT target first, then push (tablesFilter scopes to app tables)
psql "$DATABASE_URL" -c '\conninfo'             # 🟢 must say database "expertloop"
npm run db:push                                  # 🟢 "[✓] Changes applied", NO prompt. 🛑 ANY rename/drop prompt → ABORT (Unit 6)

# 6. migration-002 (archive all existing campaigns — clean slate)
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/migration-002-archive-existing.sql    # 🟢 UPDATE n, COMMIT
# migration-003 backfill is a no-op on prod (no active campaigns post-archive) — skip or run; INSERT 0 0

# 7. Build + start
npm run build
grep -q '^CLERK_SECRET_KEY=' .env && echo "🟢 CLERK_SECRET_KEY present" || echo "🛑 missing"
sudo systemctl unmask expert-in-the-loop        # if masked in step 1
sudo systemctl start expert-in-the-loop
sleep 5 && curl -sf http://localhost:5000 >/dev/null && echo "🟢 shell serves"
```

### Unit 4 verification gates (🛑 any fail → Unit 6)
```bash
# schema
psql "$DATABASE_URL" -c "SELECT data_type FROM information_schema.columns WHERE table_name='pairs' AND column_name='pair_type';"   # text
# data integrity (compare to pre-migration: 10 users / 5329 pairs / 413 votes)
psql "$DATABASE_URL" -c "SELECT (SELECT count(*) FROM users) u,(SELECT count(*) FROM pairs) p,(SELECT count(*) FROM votes) v,(SELECT count(*) FROM pairs WHERE evidence_status IS NULL) null_ev,(SELECT count(*) FROM campaigns WHERE status<>'archived') non_archived;"
# session table + kraken_* still present (db:push must NOT have touched them)
psql "$DATABASE_URL" -c "SELECT to_regclass('public.session') session, to_regclass('public.kraken_users') kraken;"
# AUTH end-to-end (browser): sign in via Clerk → /api/__clerk healthy (not 502) → lands on dashboard; an admin reloads once → admin/* reachable (role-sync)
```
**Do not reopen to reviewers until Unit 6 go/no-go clears.**

## Unit 5 — merge, deploy, validate
1. **Merge `dev → main`** on GitHub. Auto-deploy runs `git pull origin main` (ff onto the already-migrated box) + build + restart. *(Actions-green is NOT the gate — the smoke test is.)*
2. **Smoke test (prod, browser):** login → create a campaign → import a few pairs → vote → export CSV → an archived campaign rejects new votes (403) → open an **archived** campaign's Results/Analytics (config-null render check).
3. **Admins:** each confirms `admin/*` reachable (role-sync set their role on first login; reload once if the first token predates it).
4. Re-enable cron: `crontab /tmp/crontab.bak`. Take a fresh `manual success` dump.

## Unit 6 — go/no-go + rollback (only if a gate fired)
**Trigger rollback (while still write-frozen) if:** db:push showed any DROP/rename or unexpected prompt · post-migration counts differ · service won't start / smoke test fails · FAPI proxy 502s or Clerk login can't complete for valid users · admins can't reach admin/*.
```bash
# Schema-only revert (BEFORE any new-model write): restore the pre-migration dump
sudo systemctl stop expert-in-the-loop
sudo -u postgres pg_restore --clean --no-owner --no-privileges -d expertloop ~/backups/db/manual/expertloop-pre-cutover-*.dump
git checkout main && git reset --hard <pre-promotion-main-commit> && npm ci && npm run build
sudo systemctl start expert-in-the-loop          # back on Google-OAuth code; session table intact (no --force)
crontab /tmp/crontab.bak                          # re-enable backups
# Worst case: restore the manual Lightsail instance snapshot (whole box)
```
**Rollback expiry:** the pre-migration dump goes stale on the first new-model write (incl. server-initiated recompute); `migration-001-rollback.sql` dies after the first vote edit. Decide go/no-go BEFORE reopening writes.

## "Clean run"
Unit 5 complete + service error-free ~24 h → do the deferred cleanup (drop `session`, remove Google env/`connect-pg-simple`, **rotate the Google OAuth client secret**, update CLAUDE.md/`/servers` to "Production uses Clerk").
