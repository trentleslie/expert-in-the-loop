---
title: "connect-pg-simple session table auto-creation fails with esbuild bundling"
date: 2026-05-06
category: runtime-errors
module: server/auth
problem_type: runtime_error
component: database
symptoms:
  - "ENOENT error: dist/table.sql not found at runtime"
  - "OAuth login fails silently after fresh database setup"
  - "ERR_HTTP_HEADERS_SENT cascading error on /api/auth/google/callback"
  - "App serves HTTP 200 on root but all authenticated routes break"
root_cause: config_error
resolution_type: environment_setup
severity: high
tags:
  - connect-pg-simple
  - esbuild
  - session-store
  - oauth
  - postgresql
  - bundling
---

# connect-pg-simple session table auto-creation fails with esbuild bundling

## Problem

When the Express server is bundled with esbuild into `dist/index.cjs`, `connect-pg-simple`'s `createTableIfMissing: true` option fails because it tries to read `table.sql` from `dist/` instead of `node_modules/connect-pg-simple/`. This silently breaks session creation, causing OAuth login to fail on any fresh database.

## Symptoms

- OAuth login redirects back from Google but fails with "Authentication failed"
- Server logs show: `ENOENT, syscall: 'open', path: '/home/ubuntu/expert-in-the-loop-dev/dist/table.sql'`
- Cascading error: `ERR_HTTP_HEADERS_SENT: Cannot set headers after they are sent to the client`
- App appears healthy (HTTP 200 on root, health check passes) but session creation silently fails
- All authenticated routes return 401

## What Didn't Work

- **Relying on `createTableIfMissing: true`**: This is the documented approach in `connect-pg-simple`, but it uses `fs.readFileSync(path.join(__dirname, 'table.sql'))` internally. After esbuild bundles the library into `dist/index.cjs`, `__dirname` resolves to `dist/` and `table.sql` is a non-JS asset that doesn't get bundled. The file simply doesn't exist at the resolved path.

## Solution

Manually create the session table in PostgreSQL before starting the app on any new database:

```sql
CREATE TABLE IF NOT EXISTS "session" (
  "sid" varchar NOT NULL COLLATE "default",
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL,
  CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
```

The `createTableIfMissing` option can remain set in `server/auth.ts` — the library checks table existence before attempting the file read, so it becomes a no-op when the table already exists (verified: no ENOENT warnings in production or dev logs after manual table creation).

## Why This Works

The root cause is in `script/build.ts` where `connect-pg-simple` is in the esbuild allowlist (bundled INTO `dist/index.cjs` rather than kept as an external). The library's internal `fs.readFileSync` call for `table.sql` then resolves against the wrong directory. Pre-creating the table bypasses the file-read path entirely.

Production never hit this because the session table existed from before the esbuild migration. The bug only surfaces on fresh databases (dev, staging, test environments).

## Prevention

- **Document the manual step**: Any new database setup must include the session table DDL. This is documented in `CLAUDE.md` under Known Issues.
- **Consider marking `connect-pg-simple` as external in esbuild**: Adding it to the `external` array in `script/build.ts` would preserve correct `__dirname` resolution at the cost of requiring `node_modules` at runtime (already required for other externalized packages).
- **Alternative: copy `table.sql` into `dist/` as a post-build step**: This would make `createTableIfMissing` work as intended without changing the bundling strategy.
- **Long-term**: The planned Clerk OAuth migration may replace the session store entirely, making this issue moot.

## Related Issues

- GitHub issue #2: "feat: switch from db:push to Drizzle migration files" — a migration-based approach could include the session table DDL
- `CLAUDE.md` Known Issues section documents this problem and the manual SQL workaround
- `script/build.ts` line 10: `connect-pg-simple` in the esbuild bundle allowlist (root cause)
- `server/auth.ts` line 32: `createTableIfMissing: true` still set (inert when table pre-exists)
