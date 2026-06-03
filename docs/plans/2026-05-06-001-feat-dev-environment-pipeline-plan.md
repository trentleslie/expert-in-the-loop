---
title: "feat: Add dev environment deployment pipeline"
type: feat
status: active
date: 2026-05-06
origin: docs/brainstorms/dev-environment-pipeline-requirements.md
---

# feat: Add dev environment deployment pipeline

## Overview

Set up a persistent dev environment at `dev.expertintheloop.io` on the existing Lightsail server, with auto-deploy from the `dev` branch via GitHub Actions. This creates a safe staging ground for the upcoming Clerk OAuth migration and future feature work.

The work is split into two categories: code changes (committed to the repo) and server infrastructure (manual SSH setup). The code changes are minimal — one auth.ts modification and one new GitHub Actions workflow.

## Problem Frame

Expert-in-the-loop has a single deployment path: push to `main` auto-deploys to production. There is no way to test changes in a production-like environment before merging. The immediate driver is a Clerk OAuth migration that will replace the entire auth system — too risky to develop directly against production. (see origin: `docs/brainstorms/dev-environment-pipeline-requirements.md`)

## Requirements Trace

- R1. Separate PostgreSQL database (`expertloop_dev`) on the same server
- R2. Separate systemd service on port 5001
- R3. Nginx server block for `dev.expertintheloop.io` with SSL
- R4. DNS A record for `dev.expertintheloop.io`
- R5. Google OAuth redirect URI for the dev callback URL
- R6. Session cookie isolation between prod and dev instances
- R7. Dev-specific environment variables
- R8. GitHub Actions workflow for `dev` branch deploys with proper health check
- R9. Separate repo clone on server checked out to `dev` branch

## Scope Boundaries

- No in-app environment toggle — these are separate instances at separate URLs
- No visual dev/prod indicator — URL is sufficient
- No per-PR preview environments
- No separate Lightsail instance or static IP
- No changes to the production deployment pipeline

### Deferred to Separate Tasks

- Clerk OAuth migration: first feature branch off `dev` after this pipeline is operational

## Context & Research

### Relevant Code and Patterns

- `server/auth.ts` — Session cookie config (lines 26-42), OAuth callback URL construction (line 50-60). Cookie name defaults to `connect.sid` with no override. `APP_URL` env var drives callback URL.
- `server/db.ts` — Single `pg.Pool` from `DATABASE_URL`. No connection pool sizing.
- `server/index.ts` — Binds to `0.0.0.0` on `PORT` (default 5000). `trust proxy` set to 1 for nginx.
- `.github/workflows/deploy.yml` — SSH-based deploy: decode base64 key, SSH in, pull/build/restart/health-check. Secrets are repo-level (not scoped to GitHub Environments).
- `script/build.ts` — esbuild hardcodes `NODE_ENV=production` at build time. This is fine for the dev instance since we want production behavior.
- No dotenv usage — all env vars come from systemd `EnvironmentFile` or shell.
- Client code has zero env-specific configuration — talks to `/api/*` on same origin.

### Institutional Learnings

- No documented solutions exist for deployment or infrastructure topics. The CLAUDE.md deployment section is the primary reference.
- `drizzle-kit push` was removed from CI (commit `f75a180`) because it's interactive and hangs in non-TTY SSH sessions. This affects the dev deploy workflow — `db:push` must remain manual.
- The systemd `EnvironmentFile` does not handle special characters like `!` in values (noted in CLAUDE.md).

## Key Technical Decisions

- **Separate repo clone, not git worktree**: A full clone at `/home/ubuntu/expert-in-the-loop-dev/` avoids worktree complexity and gives complete isolation of `node_modules`, `dist`, and `.env`. Disk cost is negligible on an 8GB instance.
- **Port 5001 for dev**: Port 5000 is production. Port 5001 is the next available and not used by other services (PGS on 8501, KRAKEN on 8000).
- **`NODE_ENV=production` for dev instance**: The esbuild step already inlines this at build time. Setting it at runtime is redundant but harmless. The dev instance should serve built static files, not Vite HMR.
- **`SESSION_COOKIE_NAME` env var**: Rather than hardcoding different cookie names, make it configurable via env var with `connect.sid` as the default. This keeps the code change minimal and backwards-compatible with production (which won't set the var).
- **Separate workflow file**: A new `deploy-dev.yml` is cleaner than conditional logic in the existing `deploy.yml`. Each workflow is short and self-contained.
- **Branch bootstrapping sequence**: Merge Units 1 and 2 to `main` first, then create `dev` from `main`. This ensures the `deploy-dev.yml` workflow file and the cookie name change both exist on `dev` from the start. The workflow triggers on subsequent pushes to `dev`.

## Open Questions

### Resolved During Planning

- **Should the deploy workflow exit non-zero on health check failure?** Yes. The current production workflow silently succeeds on health check failure (no `set -e`, grep result not checked). The dev workflow should fix this. Production workflow improvement is out of scope.
- **Does `connect-pg-simple` need the session table pre-created?** Yes. Although `createTableIfMissing: true` is set in `server/auth.ts` (line 31), esbuild bundling breaks the auto-creation — `connect-pg-simple` tries to read `table.sql` from `dist/` instead of `node_modules/`. The session table must be created manually on any new database (see `docs/solutions/runtime-errors/connect-pg-simple-session-table-esbuild-bundle-path-2026-05-06.md`). All other tables (users, campaigns, pairs, etc.) require `db:push`.
- **How should the `dev` branch be created?** Merge Units 1 and 2 to `main`, then create `dev` from `main`. This avoids a chicken-and-egg: the `deploy-dev.yml` workflow must exist on `dev` for GitHub Actions to detect the push trigger, and the cookie name change must be on `dev` for sessions to work. Creating `dev` from `main` after both are merged solves both.
- **What reference data needs seeding in `expertloop_dev`?** At minimum, `allowed_domains` must have entries or OAuth login will fail with `domain_not_allowed` after Google redirects back. The first logged-in user also needs manual promotion to `admin` role since all new users default to `reviewer`.
- **Schema migration discipline with two databases?** Same as today — `db:push` is manual on production after merging schema changes. With two databases, it must also be run on `expertloop_dev` when schema changes land on `dev`. Document in CLAUDE.md.

### Deferred to Implementation

- **Exact `SESSION_SECRET` value for dev**: Generate at implementation time, not worth pre-deciding.
- **Memory headroom on the 8GB instance**: Should be checked with `free -h` during server setup. Two Node.js instances (~200-400MB each) plus existing services should fit, but verify.

## Implementation Units

### Code Changes (committed to repo, merged to `main` before creating `dev` branch)

- [ ] **Unit 1: Session cookie name configurability**

**Goal:** Make the Express session cookie name configurable via `SESSION_COOKIE_NAME` env var so dev and prod instances on sibling subdomains don't collide.

**Requirements:** R6

**Dependencies:** None

**Files:**
- Modify: `server/auth.ts`

**Approach:**
- In the `session()` middleware config, add `name: process.env.SESSION_COOKIE_NAME || "connect.sid"` to the options object
- This is a one-line change. Production doesn't set the env var, so behavior is unchanged. Dev sets `SESSION_COOKIE_NAME=connect.sid.dev`.

**Patterns to follow:**
- Existing env var pattern in `server/auth.ts` (e.g., `SESSION_SECRET` fallback on line 33)

**Test scenarios:**
- Happy path: When `SESSION_COOKIE_NAME` is set, the response `Set-Cookie` header uses that name instead of `connect.sid`
- Happy path: When `SESSION_COOKIE_NAME` is not set, cookie name defaults to `connect.sid` (backwards compatibility)

**Verification:**
- TypeScript type check passes (`npm run check`)
- App starts locally without the env var set and session cookies still work

- [ ] **Unit 2: GitHub Actions dev deploy workflow**

**Goal:** Create a workflow that auto-deploys the `dev` branch to the dev instance on Lightsail.

**Requirements:** R8

**Dependencies:** None for creating the file. Both Unit 1 and Unit 2 are merged to `main` first, then the `dev` branch is created from `main` (see Key Technical Decisions). Server infrastructure (Units 3-4) must be set up before the first deploy can succeed.

**Files:**
- Create: `.github/workflows/deploy-dev.yml`

**Approach:**
- Mirror the structure of `deploy.yml` but target the dev instance
- Trigger on push to `dev` branch plus `workflow_dispatch`
- SSH commands: `cd ~/expert-in-the-loop-dev`, `git pull origin dev`, `npm ci`, `npm run build`, `sudo systemctl restart expert-in-the-loop-dev`
- Health check: `curl -sf http://localhost:5001` with proper exit code propagation (unlike the production workflow which silently swallows failures)
- Reuse the same SSH secrets (`LIGHTSAIL_SSH_KEY`, `LIGHTSAIL_HOST`, `LIGHTSAIL_USER`) — same server, same credentials

**Patterns to follow:**
- `.github/workflows/deploy.yml` — same SSH key setup, same deploy script structure

**Test scenarios:**
- Happy path: Push to `dev` triggers the workflow, SSHs in, pulls, builds, restarts, health check passes
- Error path: Health check fails (app doesn't start) — workflow should show as failed in GitHub Actions
- Happy path: Push to `main` does NOT trigger the dev workflow
- Happy path: Manual `workflow_dispatch` triggers the dev deploy

**Verification:**
- Workflow file passes GitHub Actions syntax validation
- First push to `dev` after server setup triggers the workflow and completes successfully

### Infrastructure Setup (manual SSH/DNS/console work, after `dev` branch is created from `main`)

- [ ] **Unit 3: Server infrastructure — database, repo clone, env vars, systemd service**

**Goal:** Set up the dev instance's server-side infrastructure: database, repo clone, environment file, and systemd service.

**Requirements:** R1, R2, R7, R9

**Dependencies:** None (can be done before code changes land on `dev`)

**Files:**
- This unit is server-side manual configuration, not repo code changes

**Approach:**
- Create PostgreSQL database: `sudo -u postgres createdb expertloop_dev` then `ALTER DATABASE expertloop_dev OWNER TO expertuser` (ownership gives full permissions, matching how production is likely configured)
- Clone repo: `git clone https://github.com/trentleslie/expert-in-the-loop.git ~/expert-in-the-loop-dev` and `git checkout dev` (the `dev` branch must exist — created from `main` after Units 1-2 are merged)
- Create `/home/ubuntu/expert-in-the-loop-dev/.env` with dev-specific values (DATABASE_URL pointing to expertloop_dev, APP_URL=https://dev.expertintheloop.io, PORT=5001, SESSION_COOKIE_NAME=connect.sid.dev, unique SESSION_SECRET, same GOOGLE_CLIENT_ID/SECRET as prod)
- Create systemd service file at `/etc/systemd/system/expert-in-the-loop-dev.service` modeled on the existing production service, pointing to the dev working directory and env file
- `npm ci && npm run build` in the dev directory
- Run `npm run db:push` interactively to create schema in `expertloop_dev`
- Seed required reference data: query production first (`psql -U expertuser -h localhost expertloop -c "SELECT * FROM allowed_domains"`) then insert those domains into `expertloop_dev`. Without this, OAuth completes at Google but the app rejects the user with `domain_not_allowed` on redirect — a confusing failure that looks like an app bug.
- Enable and start the service
- After first login, promote the user to admin: `UPDATE users SET role = 'admin' WHERE email = '<your-email>'` in `expertloop_dev`. Without this, admin-only features (campaign management, domain management) are inaccessible on dev.

**Test scenarios:**
- Happy path: `psql -U expertuser -h localhost expertloop_dev` connects successfully
- Happy path: `curl http://localhost:5001` returns HTTP 200 after service start
- Happy path: `systemctl status expert-in-the-loop-dev` shows active (running)
- Error path: Verify production instance is unaffected — `curl http://localhost:5000` still returns 200

**Verification:**
- Dev service is running on port 5001
- Database has all schema tables after `db:push`
- Production instance continues to operate normally

- [ ] **Unit 4: Nginx, DNS, and SSL**

**Goal:** Make the dev instance publicly accessible at `https://dev.expertintheloop.io`.

**Requirements:** R3, R4

**Dependencies:** Unit 3 (dev service must be running on port 5001)

**Files:**
- This unit is server-side and DNS configuration, not repo code changes

**Approach:**
- Add DNS A record for `dev.expertintheloop.io` → `35.161.242.62` on Squarespace. Do this first — propagation can take minutes to hours.
- Add nginx server block for `dev.expertintheloop.io` proxying to `localhost:5001`. Model on the existing production server block (proxy_pass, WebSocket upgrade headers, proxy_set_header for X-Forwarded-Proto).
- Run `sudo certbot --nginx -d dev.expertintheloop.io` to obtain SSL cert and auto-configure the nginx block.
- Test and reload nginx: `sudo nginx -t && sudo systemctl reload nginx`

**Test scenarios:**
- Happy path: `https://dev.expertintheloop.io` loads the app in a browser
- Happy path: HTTP requests to `http://dev.expertintheloop.io` redirect to HTTPS
- Happy path: SSL certificate is valid (no browser warnings)
- Error path: Production site `https://expertintheloop.io` is unaffected

**Verification:**
- Browser loads `https://dev.expertintheloop.io` with valid SSL
- Production site unchanged

- [ ] **Unit 5: Google OAuth and end-to-end verification**

**Goal:** Enable OAuth login on the dev instance and verify the complete pipeline works.

**Requirements:** R5

**Dependencies:** Units 1-4 all complete

**Files:**
- No repo code changes — Google Cloud Console configuration

**Approach:**
- Add `https://dev.expertintheloop.io/api/auth/google/callback` as an authorized redirect URI in Google Cloud Console (must be done before first login attempt, or OAuth will fail with `redirect_uri_mismatch`)
- Test the full flow: visit dev.expertintheloop.io → click login → Google OAuth → redirect back → session created with `connect.sid.dev` cookie name
- Verify cookie isolation: log into both prod and dev in the same browser, confirm sessions don't interfere

**Test scenarios:**
- Happy path: Google OAuth login works on `dev.expertintheloop.io` — user lands on the dashboard after login
- Happy path: Session cookie is named `connect.sid.dev` (visible in browser dev tools)
- Integration: Log into both `expertintheloop.io` and `dev.expertintheloop.io` in the same browser — sessions are independent, logging out of one doesn't affect the other
- Happy path: Push a trivial change to `dev` branch → GitHub Actions deploys to dev instance → change is visible at `dev.expertintheloop.io`

**Verification:**
- OAuth login succeeds on dev
- Sessions are isolated between prod and dev
- GitHub Actions auto-deploy pipeline works end-to-end

## System-Wide Impact

- **Interaction graph:** The dev instance is fully independent — separate process, database, and nginx vhost. No shared state with production except the Google OAuth client credentials (temporary until Clerk migration).
- **Error propagation:** A crash in the dev instance does not affect production. They are separate systemd services with separate processes.
- **State lifecycle risks:** The only shared surface is the Google OAuth client. If the OAuth client is misconfigured (e.g., redirect URI removed), both instances lose login capability. This risk goes away after Clerk migration.
- **Resource impact:** Two Node.js instances (~200-400MB each) on an 8GB server alongside PostgreSQL, PGS Catalog Explorer, and KRAKEN. Should be fine but verify with `free -h` during setup.
- **Unchanged invariants:** Production deployment pipeline (`main` → deploy.yml → port 5000) is completely unchanged. No modifications to the production systemd service, nginx config, or database.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| DNS propagation delay | Add A record first, before other setup steps |
| OAuth redirect URI not added before first login | Sequenced as a prerequisite in Unit 5; OAuth fails gracefully (redirects to error page, doesn't crash) |
| Memory pressure on 8GB instance | Check `free -h` before starting dev service; Node.js instances are ~200-400MB each |
| `db:push` interactive hang if run non-interactively | Explicitly documented as manual SSH step, not in CI |
| Shared Google OAuth client misconfiguration | Temporary risk; goes away with Clerk migration |
| Schema drift between dev and prod databases | Document dual `db:push` discipline in CLAUDE.md; same manual process as today but doubled |
| Empty `allowed_domains` blocks login on fresh dev DB | Explicit seed step in Unit 3; copy domains from production |

## Documentation / Operational Notes

- Update `CLAUDE.md` deployment section to document the dev instance (service name, port, directory, URL, deploy branch)
- Add dev service management commands alongside existing production commands
- Document the manual `db:push` requirement for dev schema changes — note that with two databases, `db:push` must be run on `expertloop_dev` when schema changes land on `dev`, and on `expertloop` (production) when those changes are merged to `main`

## Sources & References

- **Origin document:** [docs/brainstorms/dev-environment-pipeline-requirements.md](docs/brainstorms/dev-environment-pipeline-requirements.md)
- Related code: `server/auth.ts` (session config), `.github/workflows/deploy.yml` (deploy pattern)
- Related commit: `f75a180` (db:push removed from CI)
