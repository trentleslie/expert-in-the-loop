---
title: "refactor: remove dormant Clerk FAPI proxy + leftover auth dependencies"
type: refactor
status: active
date: 2026-06-03
---

# refactor: remove dormant Clerk FAPI proxy + leftover auth dependencies

## Overview

The 2026-06-03 production cutover moved auth to Clerk in **custom-domain (CNAME) mode**, which made the Clerk FAPI proxy obsolete: `VITE_CLERK_PROXY_URL` is unset in prod (commented out), so the client's `ClerkProvider` resolves `proxyUrl` to `undefined` and talks to `clerk.expertintheloop.io` directly. The server still compiles and mounts the proxy middleware, and the client still reads the proxy env var — all inert. This refactor deletes that dead path and the dependencies it (and the earlier Passport/Google-OAuth auth) left behind. See origin: [[project_prod_cutover]] memory.

## Problem Frame

Dead, inert code carries real cost: the dormant proxy is a latent footgun (Greptile flagged it on PR #13 — a misconfigured prod that sets `CLERK_SECRET_KEY` would silently re-activate proxy mode and could re-break attribution), and stale dependencies bloat installs and audit surface. Removing them makes "prod is CNAME-direct Clerk" the only code path, matching reality.

## Requirements Trace

- R1. Remove the server-side Clerk FAPI proxy (`clerkProxyMiddleware`, its `/api/__clerk` mount, and the `http-proxy-middleware` import/constants) from `server/auth.ts` without affecting `clerkMiddleware()` auth.
- R2. Remove the client-side proxy plumbing (`VITE_CLERK_PROXY_URL` read + `proxyUrl` prop) from `client/src/App.tsx` so `ClerkProvider` uses the publishable-key-encoded CNAME FAPI directly.
- R3. Remove now-unused dependencies from `package.json` and refresh the lockfile.
- R4. Sign-in continues to work end-to-end against the CNAME FAPI after the change (build + runtime verified).

## Scope Boundaries

- No behavioral change to authentication, authorization, role-sync, or the `/api/auth/me` find-or-create flow.
- Do not touch `clerkMiddleware()`, `requireAuth`, `requireAdmin`, or the session-token `role` claim.

### Deferred to Separate Tasks

- Dropping the prod `session` DB table — separate, deliberate prod DB op (irreversible; take a fresh dump first).
- Rotating the Google OAuth client secret — manual op in Google Cloud Console (owner).
- Removing the commented `VITE_CLERK_PROXY_URL` line from the prod/dev `.env` files on Lightsail — ops cleanup (env files are not in the repo); harmless once the code no longer reads it.
- The auth degraded-state refinement (narrow `isAuthenticated` on permanent 4xx) Greptile flagged — separate change, different concern.

## Context & Research

### Relevant Code and Patterns

- `server/auth.ts` — `import { createProxyMiddleware } from "http-proxy-middleware"` (L2), `CLERK_FAPI`/`CLERK_PROXY_PATH` constants (L5–6), `clerkProxyMiddleware()` (L8–~46), and the mount `app.use(CLERK_PROXY_PATH, clerkProxyMiddleware())` inside `setupAuth` (L50). `app.use(clerkMiddleware())` (L53) and `requireAuth`/`requireAdmin` stay untouched.
- `client/src/App.tsx` — `const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL` (L28) and `proxyUrl={clerkProxyUrl}` on `<ClerkProvider>` (L242). Removing the prop makes Clerk default to the pk-encoded FAPI (CNAME).
- `package.json` — `http-proxy-middleware` (L60, used only by the removed proxy), plus auth leftovers whose code is already gone: `passport-local` (L66), `@types/connect-pg-simple` (L90), `@types/passport-local` (L93).

### Institutional Learnings

- `docs/solutions/` (session-table-esbuild-bundle-path) and the [[project_prod_cutover]] memory document why prod is CNAME-mode and why the proxy is inert. Confirmed via grep: no Google/Passport/`connect-pg-simple`/`express-session` references remain in `server/`, `shared/`, or `client/src` (code already removed in the original migration); only the dependencies linger.

## Key Technical Decisions

- **Delete rather than feature-flag the proxy.** Prod is CNAME and there is no scenario in this deployment that needs proxy mode; keeping it as a dormant toggle is precisely the footgun Greptile flagged.
- **Drop `passport-local` and the `@types/*` leftovers in the same PR.** They are already orphaned (no imports); folding them in keeps "auth cleanup" atomic and avoids a second dependency PR. Verified no runtime/test imports.
- **Verify imports after removal.** `RequestHandler` and `path` (node) in `server/auth.ts` may become unused once the proxy function is gone — drop whichever are no longer referenced so the build stays lint-clean.

## Open Questions

### Resolved During Planning

- Is any Google/Passport/session code still present? — No; grep confirms only dependencies remain, not code.
- Does anything besides the removed client plumbing call `/api/__clerk`? — No; the only references were `proxyUrl={clerkProxyUrl}` in `App.tsx`.

### Deferred to Implementation

- Exact final import line in `server/auth.ts` after removal (which of `RequestHandler`/`path` remain) — determined by what the post-removal file still references.

## Implementation Units

- [ ] **Unit 1: Remove the server-side FAPI proxy from `server/auth.ts`**

**Goal:** Delete the proxy middleware and its mount; keep `clerkMiddleware()` and the guards intact.

**Requirements:** R1

**Dependencies:** None

**Files:**
- Modify: `server/auth.ts`

**Approach:**
- Remove the `http-proxy-middleware` import, `CLERK_FAPI`/`CLERK_PROXY_PATH` constants, the entire `clerkProxyMiddleware()` function, and the `app.use(CLERK_PROXY_PATH, clerkProxyMiddleware())` line in `setupAuth`.
- Prune now-unused imports (`RequestHandler`, node `path`) if nothing else references them.
- Leave `clerkMiddleware()`, `requireAuth`, `requireAdmin`, and `resolveMigrationEmail` exactly as-is.

**Test scenarios:**
- Test expectation: none — pure dead-code removal with no behavioral change. Covered by build/type-check (Unit 4) and runtime sign-in verification (R4).

**Verification:**
- `npm run check` passes; `setupAuth` still mounts `clerkMiddleware()`; no remaining reference to `__clerk`, `createProxyMiddleware`, or `CLERK_FAPI` in `server/`.

- [ ] **Unit 2: Remove client proxy plumbing from `client/src/App.tsx`**

**Goal:** Stop reading `VITE_CLERK_PROXY_URL` and passing `proxyUrl`, so `ClerkProvider` uses the CNAME FAPI directly.

**Requirements:** R2

**Dependencies:** None (independent of Unit 1)

**Files:**
- Modify: `client/src/App.tsx`

**Approach:**
- Delete the `clerkProxyUrl` constant (L28) and the `proxyUrl={clerkProxyUrl}` prop (L242). Leave `publishableKey` and all other `ClerkProvider` props unchanged.

**Test scenarios:**
- Test expectation: none — removes an inert prop (already `undefined` at runtime in prod). Covered by the build + sign-in runtime check.

**Verification:**
- Built client bundle no longer contains `api/__clerk`; sign-in via `clerk.expertintheloop.io` still completes.

- [ ] **Unit 3: Remove dead dependencies and refresh the lockfile**

**Goal:** Drop `http-proxy-middleware` and the orphaned Passport/session `@types`.

**Requirements:** R3

**Dependencies:** Unit 1 (so `http-proxy-middleware` is no longer imported when removed)

**Files:**
- Modify: `package.json`, `package-lock.json`

**Approach:**
- Remove `http-proxy-middleware`, `passport-local`, `@types/connect-pg-simple`, `@types/passport-local`. Regenerate the lockfile via install.
- Before removing each, re-grep to confirm zero imports remain (Google/Passport code is already gone; this is dependency hygiene).

**Test scenarios:**
- Test expectation: none — dependency removal. Covered by a clean install + Unit 4 build/type-check.

**Verification:**
- `npm ci` (or install) succeeds; `npm run build` and `npm run check` pass with the deps removed.

- [ ] **Unit 4: Build, type-check, and runtime-verify sign-in**

**Goal:** Prove the removal is behavior-neutral end-to-end.

**Requirements:** R4

**Dependencies:** Units 1–3

**Files:**
- (no source changes — verification unit)

**Approach:**
- `npm run check` + `npm run build` clean.
- Run the app and confirm Clerk sign-in completes against the CNAME FAPI (no `proxyUrl`, no `/api/__clerk` call, no "unable to attribute" error), landing on the dashboard. This is the real surface — exercise it, do not rely on type-check alone.

**Test scenarios:**
- Integration: a fresh build serves the SPA; signing in with a Clerk session reaches the dashboard and `/api/auth/me` returns the user — confirming `clerkMiddleware()` auth is unaffected by the proxy removal.

**Verification:**
- Build + type-check green; sign-in works in the running app; vote/admin actions still authorized (role claim path untouched).

## System-Wide Impact

- **Interaction graph:** Only the `/api/__clerk` proxy route and the client `proxyUrl` prop are removed. `clerkMiddleware()` populates auth state for every request and is untouched; `requireAuth`/`requireAdmin` read from it unchanged.
- **Error propagation:** No new failure paths; a route is removed, not added.
- **API surface parity:** No public API change. `/api/__clerk` was an internal proxy only the client used (and only in proxy mode, which prod doesn't use).
- **Unchanged invariants:** Clerk auth, role-sync, `/api/auth/me`, and all `/api/*` guards behave identically. CNAME-direct sign-in is already the live behavior; this change just deletes the unused alternative.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| A non-prod/local environment relied on proxy mode | None in this deployment uses it (prod CNAME, dev bypasses proxy). Runtime sign-in verification (Unit 4) catches any regression before merge. |
| `passport-local` / `@types/*` removal breaks a hidden import | Grep-confirmed zero references; clean `npm ci` + build in Unit 4 is the gate. |
| Pruning `server/auth.ts` imports too aggressively breaks the build | `npm run check` (Unit 4) fails loudly on any unused/missing import. |

## Documentation / Operational Notes

- `CLAUDE.md` already states prod is Clerk CNAME mode and that `VITE_CLERK_PROXY_URL` must stay unset; after this lands, update that note to say the proxy code has been removed (no longer just "dormant").
- Ops follow-up (not this PR): delete the commented `VITE_CLERK_PROXY_URL` line from the prod/dev `.env` on Lightsail.

## Sources & References

- Greptile PR #13 review comment on `server/auth.ts:46` (dormant proxy middleware).
- Memory: [[project_prod_cutover]] — CNAME-vs-proxy root cause and cutover record.
- Related code: `server/auth.ts`, `client/src/App.tsx`, `package.json`.
