---
title: "Clerk Authentication Migration for Express + React (Passport.js/Google OAuth to Clerk)"
date: 2026-05-06
category: best-practices
module: authentication
problem_type: best_practice
component: authentication
severity: high
applies_when:
  - Migrating Express + React SPA from Passport.js/Google OAuth to Clerk
  - Replacing server-side sessions (express-session, connect-pg-simple) with Clerk JWT auth
  - Using Clerk with wouter or any exact-match client-side router
  - Migrating apps that store OAuth provider IDs as database primary keys
tags:
  - clerk
  - express
  - react
  - passport-migration
  - wouter
  - google-oauth
  - authentication
  - session-migration
---

# Clerk Authentication Migration for Express + React (Passport.js/Google OAuth to Clerk)

## Context

Migrating expert-in-the-loop (Express + React/Vite/wouter) from Passport.js with Google OAuth and PostgreSQL session storage to Clerk authentication. The app used express-session with connect-pg-simple, a custom `allowed_domains` table for domain restriction, and stored Google's `sub` claim as the user primary key (`varchar(255)`). A sibling project (biomapper-ui) had already completed this migration with `@clerk/express`, establishing the Express-specific pattern. (auto memory [claude]: dev environment at dev.expertintheloop.io was set up as the staging ground for this migration.)

## Guidance

### Server-side

- Use `@clerk/express` with `clerkMiddleware()` mounted globally **before body parsers** in the Express middleware chain. Write custom `requireAuth` and `requireAdmin` guards using `getAuth(req)` — Clerk's built-in `requireAuth` issues redirects, not 401 JSON responses.
- Set up a FAPI proxy at `/api/__clerk` using `http-proxy-middleware`. Only active in production — Clerk dev instances bypass the proxy.
- Store user roles in Clerk `publicMetadata`. Expose via custom session token claim (`"role": "{{user.public_metadata.role}}"`) so `getAuth(req).sessionClaims.role` works without an API call per request.
- Use Clerk Dashboard allowlist for domain restriction. Remove server-side domain checks — they add a fragile dependency on session claim availability that varies between dev and production tokens.
- Implement find-or-create on `/api/auth/me` with email-based fallback for migrating old user IDs.

### Client-side

- Wrap app in `<ClerkProvider>` with `publishableKey`, `proxyUrl` (undefined in dev, set in production), and `routerPush`/`routerReplace` props for wouter compatibility.
- Replace custom `AuthProvider`/`useAuth()` with a thin wrapper over Clerk hooks (`useUser`, `useAuth`, `useClerk`) that maintains the same API shape to minimize component changes.
- Use Clerk's `<SignIn>` and `<SignUp>` components with `routing="path"`.

### What to remove

- `passport`, `passport-google-oauth20`, `express-session`, `connect-pg-simple` and their type packages
- The PostgreSQL `session` table dependency
- All `/api/auth/google`, `/api/auth/google/callback`, `/api/auth/logout` routes
- The `allowed_domains` table admin routes (domain management moves to Clerk Dashboard)
- Update esbuild allowlist in `script/build.ts`: remove old packages, add `@clerk/express` and `http-proxy-middleware`

## Why This Matters

Without this knowledge, three specific failures occur during deployment:

1. **OAuth flow breaks silently.** Clerk's `<SignIn>` redirects to `/login/sso-callback` during Google OAuth. If the router only handles exact `/login`, the callback hits 404 and authentication never completes.

2. **Existing users get locked out.** If find-or-create uses Clerk ID only, the insert fails with a duplicate key on email (old Google ID record still exists). Or if the constraint is relaxed, duplicate records appear and data is split across accounts.

3. **All authenticated requests get 403.** If you add server-side domain checks reading from session claims (e.g., `primary_email`), but the claim isn't populated in dev tokens, every request fails domain validation — even for allowed domains.

## When to Apply

- Migrating any Express + React SPA from Passport.js to Clerk
- Migrating apps that store OAuth provider IDs (Google sub, GitHub ID) as database primary keys
- Using Clerk with wouter or any exact-match client-side router
- Deploying Clerk behind nginx with FAPI proxy configuration
- Any Clerk integration replacing server-side domain restriction

## Examples

### Pitfall 1: Wouter routing vs Clerk subpaths

Clerk's `<SignIn>` uses subpaths (`/login/sso-callback`, `/login/factor-one`) during the OAuth flow. Wouter's `<Route path="/login">` only matches exact paths.

```tsx
// BROKEN — /login/sso-callback hits 404
<Route path="/login">
  <ClerkSignInPage />
</Route>

// WORKING — catches all Clerk subpaths
<Route path="/login/:rest*">
  <ClerkSignInPage />
</Route>
<Route path="/login">
  <ClerkSignInPage />
</Route>
```

### Pitfall 2: Google-to-Clerk user ID migration

Users table had Google's `sub` claim as primary key (e.g., `111130112711144645718`). Clerk uses `user_xxx` format. Find-or-create by Clerk userId fails with duplicate key on email.

```typescript
// BROKEN — duplicate key violation
let user = await storage.getUser(clerkUserId); // not found
await storage.createUser({ id: clerkUserId, email, ... }); // FAILS: email exists

// WORKING — email-based lookup with in-place ID migration
let user = await storage.getUser(clerkUserId);
if (!user) {
  const existingByEmail = await storage.getUserByEmail(email);
  if (existingByEmail) {
    await storage.updateUserId(existingByEmail.id, clerkUserId);
    user = await storage.getUser(clerkUserId);
  } else {
    user = await storage.createUser({ id: clerkUserId, email, ... });
  }
}
```

### Pitfall 3: Redundant server-side domain check (session history)

Server-side domain check via `sessionClaims.primary_email` caused 403 on all routes because Clerk dev tokens don't populate custom claims the same way production tokens do. The kraken-chatbot best practices doc had warned "Clerk JWTs don't contain email claims" — this is the Express-side manifestation of the same issue.

Resolution: remove server-side domain check entirely. Clerk Dashboard allowlist handles sign-up restriction at the source, making the server-side check redundant and a failure point.

### Pitfall 4: Clerk CLI allowlist config not persisting (session history)

When using `npx clerk config patch` to set `allowlist_enabled: true`, the change silently failed to persist. Required patching both `sign_up_mode` and `allowlist_enabled` in the same request. Always verify config changes with `npx clerk config pull` after patching.

## Related

- **Reference implementation:** biomapper-ui `artifacts/api-server/src/app.ts` (same Clerk account, Express backend, production proxy pattern)
- **Sibling docs:** kraken-chatbot `docs/solutions/best-practices/clerk-auth-react-fastapi-integration-2026-05-06.md` (FastAPI pattern, shared pitfalls on wouter compat and JWT email claims)
- **Migration plan:** `docs/plans/2026-05-06-002-feat-clerk-auth-migration-plan.md`
- **PR:** trentleslie/expert-in-the-loop#3 (feat/clerk-auth -> dev, Greptile reviewed)
- **Clerk Express docs:** https://clerk.com/docs/reference/express/overview
- **Clerk FAPI proxy:** https://clerk.com/docs/guides/dashboard/dns-domains/proxy-fapi
