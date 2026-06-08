---
title: "Clerk prod cutover: FAPI attribution 400 + admin 403 (prod instance config not copied from dev)"
date: 2026-06-03
category: integration-issues
module: authentication
problem_type: integration_issue
component: authentication
severity: critical
symptoms:
  - "Sign-in fails; console: 'We were unable to attribute this request to an instance running on Clerk. Make sure that your Clerk Publishable Key is correct'"
  - "HTTP 400 on /api/__clerk/v1/client and /api/__clerk/v1/environment"
  - "Admins get 403 'Forbidden: Admin access required' on every admin route (e.g. POST /api/campaigns) in ~1ms despite DB role=admin and /api/auth/me returning role:admin"
  - "Failures are production-only; dev never reproduced (dev bypasses the FAPI proxy; the session claim existed only on the dev instance)"
  - "Enabling the Clerk allowlist on prod returns 402 unsupported_subscription_plan_features (app:allowlist)"
root_cause: config_error
resolution_type: config_change
related_components:
  - tooling
tags:
  - clerk
  - authentication
  - dev-prod-parity
  - fapi-proxy
  - session-token-claims
  - custom-domain
  - cutover
  - publishable-key
---

# Clerk prod cutover: FAPI attribution 400 + admin 403 (prod instance config not copied from dev)

## Problem

During the Google-OAuth → Clerk production cutover, sign-in at `https://expertintheloop.io` failed with a Clerk "unable to attribute this request" error, and once sign-in was fixed, every admin route returned 403. Both failures trace to a single fact: **the production Clerk instance is a separate instance from dev, and Clerk does not propagate instance configuration — FAPI/custom-domain mode, session-token claims, allowlist — from dev to prod.** Anything configured in dev must be re-created on the prod instance explicitly.

## Symptoms

- **Sign-in (Failure 1):** browser console `We were unable to attribute this request to an instance running on Clerk. Make sure that your Clerk Publishable Key is correct.`; HTTP **400** on `/api/__clerk/v1/client` and `/api/__clerk/v1/environment`.
- **Admin (Failure 2):** HTTP **403** `Forbidden: Admin access required` on every admin route (e.g. `POST /api/campaigns`), in ~1 ms — despite DB `role=admin` and `/api/auth/me` returning `role: admin`.
- Both are **production-only**; dev never reproduced them.
- **Bonus gotcha:** enabling the Clerk allowlist on prod returned **402** `unsupported_subscription_plan_features` (`app:allowlist`).

## What Didn't Work

Red herrings on the attribution 400, in order:
- **Suspected nginx Host forwarding** — grep for the Host-rewrite config returned empty; not the cause.
- **`curl` with an explicit `Host: expertintheloop.io`** — still 400, ruling out a proxy Host issue.
- **Re-verifying `VITE_CLERK_PROXY_URL` and `pk_live` were "present and correct"** — both *looked* fine, which masked the real problem. The key was the wrong **mode**, not a wrong value. The breakthrough was decoding the publishable key, which revealed the instance was **custom-domain (CNAME) mode**, not proxy mode.

Related dead ends from earlier sessions on this same migration (session history):
- **Doubled CNAME hostname in Squarespace DNS** (session history) — the five Clerk CNAME records (`accounts`, `clerk`, `clk._domainkey`, `clk2._domainkey`, `clkmail`) were entered with the **full** domain in Squarespace's "Name" field (e.g. `clerk.expertintheloop.io`). Squarespace appends the zone, producing `clerk.expertintheloop.io.expertintheloop.io` → NXDOMAIN → Clerk domain verification failed. Fix: enter only the subdomain prefix (`clerk`) in the Name field.
- **Server-side domain check reading `sessionClaims.primary_email`** (session history) — an early domain restriction caused `403` on *every* authenticated request, because dev tokens don't populate custom claims like prod. Fix: remove the server-side domain check; let Clerk's allowlist gate sign-up at the source.
- **`config patch` silently not setting `allowlist_enabled: true`** (session history) — patching that field alone didn't persist; it needs `sign_up_mode` **and** `allowlist_enabled` in the same request, verified with `config pull`.
- **`clerkClient.users.updateUser({publicMetadata})` clobbers other metadata keys** (session history) — role-sync first used `updateUser`, which replaces the whole `publicMetadata`; switched to `updateUserMetadata` (merge).

## Solution

### Fix 1 — Sign-in: stop forcing FAPI proxy mode (use the CNAME instance directly)

The prod instance is **custom-domain (CNAME) mode**: its `pk_live` decodes to FAPI domain `clerk.expertintheloop.io` (a live CNAME → Clerk's Cloudflare FAPI). The app was forcing **proxy mode** — `VITE_CLERK_PROXY_URL=https://expertintheloop.io/api/__clerk` plus a server `/api/__clerk` proxy (`clerkProxyMiddleware` in `server/auth.ts`) forwarding to the **generic** `frontend-api.clerk.dev` with a `Clerk-Proxy-Url` header. A custom-domain instance can't attribute generic-target proxied requests → 400. (The proxy path is **production-only**; dev bypasses it, so it had never executed before cutover.)

In `/home/ubuntu/expert-in-the-loop/.env`, comment out the proxy URL, then rebuild sourcing the `VITE_` vars and restart:

```bash
# .env:  # VITE_CLERK_PROXY_URL=https://expertintheloop.io/api/__clerk
cd /home/ubuntu/expert-in-the-loop
set -a; source <(grep '^VITE_' .env); set +a
npm run build
sudo systemctl restart expert-in-the-loop
```

With `proxyUrl` undefined, `ClerkProvider` talks to `clerk.expertintheloop.io` directly. Sign-in worked. (The dormant proxy code + `http-proxy-middleware` dependency were later removed entirely.)

### Fix 2 — Admin 403: add the missing session-token claim on the prod instance

`requireAdmin` (`server/auth.ts`) reads `auth.sessionClaims.role`. The custom claim `role = {{user.public_metadata.role}}` existed only on the **dev** instance; the prod instance had `session: null`, so the token never carried `role` — even though `publicMetadata.role` was already `admin` (a per-login role-sync sets it). Patch the prod instance's session config to mirror dev:

```bash
npx clerk config patch --instance ins_3EYvlYvW6FMI4GdutR8RS7S0Zm1 \
  --json '{"session":{"allowed_clock_skew":5,"lifetime":60,"claims":{"primary_email":"{{user.primary_email_address.email_address}}","role":"{{user.public_metadata.role}}"}}}'
```

**Before:** prod `session: null`. **After:** prod tokens carry `primary_email` + `role`. After the 60 s token `lifetime` expired (or a hard reload forced a refresh), the new token carried `role=admin` and `requireAdmin` passed.

### Diagnostic commands that cracked it

```bash
# Decode the publishable key -> the instance FAPI domain -> its mode
PK=$(grep '^VITE_CLERK_PUBLISHABLE_KEY=' .env | cut -d= -f2)
echo "${PK#pk_live_}" | base64 -d        # -> clerk.expertintheloop.io$  (custom domain = CNAME mode)

npx clerk apps list                       # both instances + pks (prod ins_3EYvlY… / dev ins_3DNUU…)
npx clerk config pull --instance <id>     # diff dev vs prod: session.claims, auth_access_control
npx clerk config patch --instance <id> --dry-run --json '{...}'   # preview before applying
```

## Why This Works

- **CNAME vs proxy attribution.** Clerk attributes a frontend request to an instance by the FAPI domain it talks to, which the `pk_live` key encodes. When the key decodes to a **custom domain** (a live CNAME → Clerk), the client must hit that domain **directly** (CNAME mode). `VITE_CLERK_PROXY_URL` instead routes through the app's `/api/__clerk` proxy to the **generic** FAPI with a `Clerk-Proxy-Url` header — which a custom-domain instance doesn't expect, so it can't attribute it → 400.
- **Per-instance session claims.** Custom claims are part of an instance's token template; `requireAdmin` depends on `role` being in the JWT, but token contents are controlled entirely by that instance's `session.claims`. Dev had the claim wired; prod had `session: null`. `publicMetadata.role=admin` is necessary but not sufficient — without the claim mapping, the role is never projected into the token, so the server never sees it.
- **Clerk does not copy dev → prod.** FAPI mode, session-token claims, and allowlist/restrictions are all per-instance and are **not** propagated when a production instance is created. Treat the prod instance as unconfigured until proven otherwise.

## Prevention

A checklist for future Clerk production cutovers:

1. **Decode the prod publishable key first** to confirm FAPI mode before wiring the client:
   `echo "${PK#pk_live_}" | base64 -d`
   - Custom domain (`clerk.yourapp.com$`) → **CNAME mode**: do **not** set `VITE_CLERK_PROXY_URL` and do **not** mount a FAPI proxy.
   - Generic Clerk domain → proxy/standard mode applies.
2. **Config-pull-diff dev vs prod** before going live; specifically check `session.claims` and `auth_access_control`. Mirror required claims (`role`, `primary_email`) onto prod with `config patch` (use `--dry-run` first).
3. **Internalize the per-instance rule:** FAPI mode, session-token claims, and allowlist are NOT inherited from dev.
4. **Exercise production-only code paths before cutover.** The FAPI proxy and `sessionClaims.role` enforcement only run in prod (dev bypasses them), so they won't surface in dev testing — test them against the prod instance explicitly.
5. **Account for token lifetime when verifying claim changes.** Existing tokens stay stale until they expire (here 60 s); force a hard reload before concluding a claim fix failed.
6. **Allowlist/restrictions may be plan-gated** — enabling it can fail with `402 unsupported_subscription_plan_features (app:allowlist)`. Verify the prod plan supports the features you rely on, or enforce domain restriction in app code.
7. **DNS CNAME "Name" field:** enter only the subdomain prefix; some registrars (Squarespace) append the zone and silently double the hostname → NXDOMAIN.

## Related Issues

- Companion (knowledge-track, dev-side migration pattern): `docs/solutions/best-practices/clerk-auth-migration-express-react-2026-05-06.md` — its Pitfall 4 (allowlist `config patch` persistence) and the role-claim setup are the dev precursors to these prod-cutover failures. That doc predates the prod cutover and does not cover CNAME-vs-proxy attribution or the missing prod session claim; this doc is its production sequel.
- Legacy auth removed in the same cutover: `docs/solutions/runtime-errors/connect-pg-simple-session-table-esbuild-bundle-path-2026-05-06.md`.
- Same single-instance auto-deploy operational frame (prod state not carried by the merge): `docs/solutions/workflow-issues/drizzle-destructive-migration-vs-auto-deploy-2026-05-29.md`.
