# Dev Environment Deployment Pipeline

**Date:** 2026-05-06
**Status:** Draft
**Scope:** Standard

## Problem

Expert-in-the-loop currently has a single deployment path: push to `main` auto-deploys to production at `expertintheloop.io`. There is no way to test changes in a production-like environment before merging to `main`. The immediate need is a safe place to develop and test a Clerk OAuth migration (replacing the current Google OAuth + Passport.js auth system) without risking the production instance.

## Goals

1. Stand up a dev instance of expert-in-the-loop at `dev.expertintheloop.io` on the same Lightsail server
2. Auto-deploy from the `dev` branch via GitHub Actions
3. Isolate dev from production: separate database, separate systemd service, separate env vars
4. Keep the same auth setup (Google OAuth, same domain whitelist) temporarily — Clerk migration is the first feature branch off `dev`

## Non-Goals

- No in-app environment toggle (these are separate instances at separate URLs)
- No visual dev/prod indicator in the UI (URL is sufficient)
- No preview environments per PR — just a single persistent `dev` environment
- No separate Lightsail instance or static IP

## Requirements

### R1: Dev Database

- Create a new PostgreSQL 16 database `expertloop_dev` on the same server
- Same `expertuser` role with appropriate permissions
- Starts empty; schema pushed manually via interactive SSH (`npm run db:push`) before starting the dev service for the first time, and again whenever schema changes land on `dev`
- Dev `DATABASE_URL` points to `expertloop_dev`

### R2: Dev Systemd Service

- New service file: `expert-in-the-loop-dev.service`
- Runs on port 5001 (or another available port)
- `EnvironmentFile` points to `/home/ubuntu/expert-in-the-loop-dev/.env`
- Working directory: `/home/ubuntu/expert-in-the-loop-dev/` (separate clone/worktree of the repo)

### R3: Nginx Configuration

- Add a server block for `dev.expertintheloop.io`
- Proxy to `localhost:5001`
- SSL via Let's Encrypt (certbot with nginx plugin, same as production)
- HTTP-to-HTTPS redirect

### R4: DNS

- Add an A record for `dev.expertintheloop.io` pointing to the existing static IP `35.161.242.62`
- Configured on Squarespace (same registrar as the root domain)

### R5: Google OAuth Redirect URI

- Add `https://dev.expertintheloop.io/api/auth/google/callback` as an authorized redirect URI in the existing Google Cloud Console OAuth client
- Dev `.env` sets `APP_URL=https://dev.expertintheloop.io`

### R6: Session Cookie Isolation

Both instances share the parent domain `expertintheloop.io`. The default Express session cookie name (`connect.sid`) would collide, causing auth failures when users visit both. Fix: add a `SESSION_COOKIE_NAME` env var (e.g., `connect.sid.dev` for dev) and use it in `server/auth.ts` session config. This is a small code change required before the dev instance works correctly.

### R7: Dev Environment Variables

Production `.env` keys that need dev equivalents:
- `DATABASE_URL` — points to `expertloop_dev`
- `APP_URL` — `https://dev.expertintheloop.io`
- `PORT` — `5001`
- `NODE_ENV` — `production` (so the built static files are served, not Vite dev server)
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — same as production (temporary)
- `SESSION_SECRET` — different value from production
- `SESSION_COOKIE_NAME` — `connect.sid.dev` (to avoid cookie collision with production)

### R8: GitHub Actions Deploy Workflow

- New workflow or extend existing: push to `dev` branch triggers deploy to the dev instance
- Steps: SSH into Lightsail, `cd ~/expert-in-the-loop-dev`, `git pull origin dev`, `npm ci`, `npm run build`, `sudo systemctl restart expert-in-the-loop-dev`, health check on port 5001
- Health check should exit non-zero on failure so GitHub Actions shows the deploy as failed
- Existing `deploy.yml` (push to `main`) remains unchanged

### R9: Repo Setup on Server

- Separate clone at `/home/ubuntu/expert-in-the-loop-dev/`
- Checked out to the `dev` branch
- Own `node_modules/`, own `dist/`, own `.env`

## Implementation Order

1. DNS A record for `dev.expertintheloop.io` (propagation takes time, do first)
2. Google Cloud Console: add dev redirect URI (must be done before first login attempt)
3. Server setup: create database, clone repo, create `.env`, systemd service, nginx config, SSL cert
4. Code change: session cookie name via env var in `server/auth.ts`
5. Manual `db:push` via interactive SSH
6. GitHub Actions workflow for `dev` branch deploys
7. Verify end-to-end: deploy, login, basic functionality

## Dependencies

- Squarespace DNS access (for A record)
- Google Cloud Console access (for OAuth redirect URI)
- SSH access to Lightsail instance

## Open Questions

None — decisions resolved during brainstorm.

## Future Work

- Clerk OAuth migration (first feature branch off `dev`)
- Potentially per-PR preview environments if the team grows
