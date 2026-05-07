# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server (Vite HMR + Express on port 5000)
npm run build        # Build client (Vite) + server (esbuild) → dist/
npm run start        # Run production build: node dist/index.cjs
npm run check        # TypeScript type checking
npm run db:push      # Push Drizzle schema changes to PostgreSQL
```

## Documented Solutions

`docs/solutions/` — documented solutions to past problems (runtime errors, deployment issues, workflow patterns), organized by category with YAML frontmatter (`module`, `tags`, `problem_type`). Relevant when debugging or implementing in documented areas.

## Architecture

Full-stack TypeScript monorepo. A single Express process serves both the API (`/api/*`) and the React SPA (static files from `dist/public/`).

```
client/          React 18 SPA (Vite, Wouter router, TanStack Query, shadcn/ui + Tailwind)
server/          Express API (Clerk auth, Drizzle ORM, PostgreSQL)
shared/          Shared schema: Drizzle table definitions + Zod validation (used by both sides)
script/build.ts  Build orchestrator: Vite for client → dist/public/, esbuild for server → dist/index.cjs
```

### Data flow

- **Auth**: Clerk authentication (`@clerk/express` + `@clerk/react`). `clerkMiddleware()` populates auth state; custom `requireAuth`/`requireAdmin` guards in `server/auth.ts`. Domain restriction via Clerk Dashboard allowlist (`*@phenomehealth.org`). User roles (`reviewer`/`admin`) stored in Clerk `publicMetadata`, exposed via custom session token claim. FAPI proxy at `/api/__clerk` (production only). User find-or-create on `/api/auth/me` with email-based migration from legacy Google OAuth IDs.
- **Client state**: TanStack Query (staleTime=Infinity, no auto-refetch). Auth state via `useAuth()` hook (thin wrapper over Clerk's `useUser`/`useAuth`/`useClerk`).
- **Server routing**: All in `server/routes.ts`. Guards: `requireAuth`, `requireAdmin` middleware. Storage abstraction in `server/storage.ts`.

### Key schema entities (shared/schema.ts)

Users → Campaigns → Pairs → Votes. Campaigns have types (questionnaire_match, loinc_mapping, custom). Votes support binary (match/no_match/unsure) or numeric scoring. Supporting tables: AllowedDomains, SkippedPairs, ImportTemplates.

### Path aliases

`@/*` → `client/src/`, `@shared/*` → `shared/`, `@assets/*` → `attached_assets/` (configured in vite.config.ts and tsconfig.json)

## Deployment (AWS Lightsail)

**Instance**: `expert-in-the-loop-upgraded` at `35.161.242.62`
**SSH**: `ssh -i ~/.ssh/lightsail-expert.pem ubuntu@35.161.242.62`

Stack: Ubuntu 22.04, Node.js 20, Python 3.11, PostgreSQL 16, nginx reverse proxy, Let's Encrypt SSL (auto-renew), systemd services.

### Hosted Applications

| App | URL | Port | Service | Stack |
|-----|-----|------|---------|-------|
| Expert-in-the-Loop | https://expertintheloop.io | 5000 | `expert-in-the-loop` | Node.js/Express |
| Expert-in-the-Loop (Dev) | https://dev.expertintheloop.io | 5001 | `expert-in-the-loop-dev` | Node.js/Express |
| PGS Catalog Explorer | https://pgsc.expertintheloop.io | 8501 | `pgs-catalog-explorer` | Python/Streamlit |
| KRAKEN Chatbot | https://kraken.expertintheloop.io | 8000 | `kraken-backend` | React + Python/FastAPI |

```
/home/ubuntu/
├── expert-in-the-loop/      # Production (main branch, port 5000)
├── expert-in-the-loop-dev/  # Dev (dev branch, port 5001)
├── pgs-catalog-explorer/    # Streamlit app (Python, port 8501)
└── kraken-chatbot/          # KRAKEN KG chat (React + FastAPI, port 8000)
```

### AWS infrastructure

- **Region**: us-west-2a
- **Instance**: `expert-in-the-loop-upgraded` (bundle: `large_3_0`, 8GB RAM, blueprint: `ubuntu_22_04`)
- **Static IP**: `expert-in-the-loop-ip` → `35.161.242.62`
- **Domain**: `expertintheloop.io` (DNS A records on Squarespace pointing to static IP)
- **Subdomains**: `dev.expertintheloop.io` (Dev instance), `pgsc.expertintheloop.io` (PGS Catalog), `kraken.expertintheloop.io` (KRAKEN Chatbot) → same static IP
- **Open ports**: 22 (SSH), 80 (HTTP → redirects to HTTPS), 443 (HTTPS), 5000 (direct app access)
- **SSL**: Let's Encrypt via certbot with nginx plugin, auto-renews via systemd timer

```bash
# Useful AWS CLI commands (run from local machine)
aws lightsail get-instance --instance-name expert-in-the-loop-upgraded
aws lightsail get-static-ip --static-ip-name expert-in-the-loop-ip
aws lightsail get-instance-metric-data --instance-name expert-in-the-loop-upgraded \
  --metric-name CPUUtilization --period 300 --unit Percent \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) --statistics Average
```

### Database

- **PostgreSQL 16** (from PGDG apt repo, not Ubuntu default PG 14)
- **Cluster**: 16/main on port 5432
- **User**: `expertuser`
- **Production database**: `expertloop`
- **Dev database**: `expertloop_dev`
- **Auth**: md5 (configured in `/etc/postgresql/16/main/pg_hba.conf`)
- **Backup**: `pg_dump -U expertuser -h localhost -Fc expertloop > backup.dump`
- **Restore**: `pg_restore -U expertuser -d expertloop -h localhost --no-owner --no-privileges backup.dump`
- **Schema changes**: `npm run db:push` must be run manually via interactive SSH on each database when schema changes land. Run on `expertloop_dev` when pushing to `dev`, and on `expertloop` when merging to `main`.

### Manual Deploy workflow (alternative)

```bash
# SSH into Lightsail
ssh -i ~/.ssh/lightsail-expert.pem ubuntu@35.161.242.62

# Pull, rebuild, restart
cd ~/expert-in-the-loop
git remote set-url origin https://<GITHUB_PAT>@github.com/trentleslie/expert-in-the-loop.git
git pull origin main
git remote set-url origin https://github.com/trentleslie/expert-in-the-loop.git
npm run build
sudo systemctl restart expert-in-the-loop
```

### Automated Deployment (GitHub Actions)

| Branch | Workflow | Target | Port |
|--------|----------|--------|------|
| `main` | `.github/workflows/deploy.yml` | `~/expert-in-the-loop/` | 5000 |
| `dev` | `.github/workflows/deploy-dev.yml` | `~/expert-in-the-loop-dev/` | 5001 |

Both workflows SSH into Lightsail, pull the branch, run `npm ci && npm run build`, restart the systemd service, and health-check. The dev workflow also sources `VITE_` env vars from `.env` before build (required for Clerk publishable key).

**Actions URL**: https://github.com/trentleslie/expert-in-the-loop/actions

To trigger manually: Go to Actions → select the workflow → "Run workflow"

**GitHub Secrets** (manage via `gh secret set`, not web UI):
| Secret | Purpose |
|--------|---------|
| `LIGHTSAIL_SSH_KEY` | Base64-encoded SSH private key |
| `LIGHTSAIL_HOST` | Server IP (35.161.242.62) |
| `LIGHTSAIL_USER` | SSH user (ubuntu) |

### Service management

```bash
# Expert-in-the-Loop — Production (Node.js)
sudo systemctl status expert-in-the-loop
sudo systemctl restart expert-in-the-loop
sudo journalctl -u expert-in-the-loop -f

# Expert-in-the-Loop — Dev (Node.js)
sudo systemctl status expert-in-the-loop-dev
sudo systemctl restart expert-in-the-loop-dev
sudo journalctl -u expert-in-the-loop-dev -f

# PGS Catalog Explorer (Streamlit)
sudo systemctl status pgs-catalog-explorer
sudo systemctl restart pgs-catalog-explorer
sudo journalctl -u pgs-catalog-explorer -f

# KRAKEN Chatbot (FastAPI)
sudo systemctl status kraken-backend
sudo systemctl restart kraken-backend
sudo journalctl -u kraken-backend -f

# Nginx
sudo nginx -t && sudo systemctl reload nginx
```

### PGS Catalog Explorer deploy workflow

```bash
cd ~/pgs-catalog-explorer
git pull origin main
sudo systemctl restart pgs-catalog-explorer
```

Dependencies managed via `uv` (lockfile: `uv.lock`). To update dependencies:
```bash
cd ~/pgs-catalog-explorer
source .venv/bin/activate
uv sync
sudo systemctl restart pgs-catalog-explorer
```

### KRAKEN Chatbot deploy workflow

Automated via GitHub Actions (push to `main` triggers deploy). Manual workflow:

```bash
cd ~/kraken-chatbot
git pull origin main
npm ci && VITE_WS_URL=wss://kraken.expertintheloop.io/ws/chat npm run build
cd backend && uv sync
sudo systemctl restart kraken-backend
```

**Authentication**: Uses Claude CLI OAuth. To re-authenticate:
```bash
claude login  # Opens browser for OAuth (may require SSH with X forwarding or setup-token)
```

### Environment

Dev `.env` on Lightsail (`/home/ubuntu/expert-in-the-loop-dev/.env`):
`DATABASE_URL`, `NODE_ENV`, `PORT`, `APP_URL`, `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`, `ALLOWED_EMAIL_DOMAINS`

Production `.env` on Lightsail (`/home/ubuntu/expert-in-the-loop/.env`):
`DATABASE_URL`, `NODE_ENV`, `PORT`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, `APP_URL`
(Production still uses Google OAuth — will be updated when Clerk is promoted to production.)

**Note**: Express has `trust proxy` enabled for nginx `X-Forwarded-Proto` headers. The systemd `EnvironmentFile` does not handle special characters like `!` in values — use only alphanumeric passwords.

### Authentication (Clerk)

Auth is managed by Clerk (`@clerk/express` + `@clerk/react`). Key configuration:

- **Clerk app**: "Expert in the Loop" (`app_3DNUUBLOx2pwZayuOHn2nY3DZm7`)
- **Dashboard**: https://dashboard.clerk.com — manage users, domain allowlist, session token claims, social connections
- **CLI**: `npx clerk` (authenticated as `trentleslie@gmail.com`) — `config pull`, `config patch`, `api`, `apps list`
- **Domain restriction**: Clerk Dashboard → Restrictions → Allowlist (`*@phenomehealth.org`). No server-side domain check.
- **Roles**: Stored in Clerk `publicMetadata.role` (`reviewer` or `admin`). Exposed via custom session token claim. Manage via Dashboard or `npx clerk api /users/{id} -X PATCH -d '{"public_metadata":{"role":"admin"}}'`
- **FAPI proxy**: `/api/__clerk` via `http-proxy-middleware` (production only; dev instances bypass proxy)
- **Google OAuth**: Configured as a social connection in Clerk Dashboard (not in app code)
- **User ID migration**: `/api/auth/me` handles find-or-create with email-based fallback for users with legacy Google OAuth IDs
