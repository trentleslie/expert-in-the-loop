---
title: "drizzle-zod widens jsonb $type discriminated unions, breaking db.insert() types"
date: 2026-05-29
category: build-errors
module: shared/schema + campaign config
problem_type: build_error
component: database
symptoms:
  - "TS2769: No overload matches this call on db.insert(table).values(...)"
  - "Type 'string' is not assignable to type '\"binary\"' (discriminated-union literal widened)"
root_cause: wrong_api
resolution_type: code_fix
severity: medium
related_components:
  - tooling
tags: [drizzle, drizzle-zod, zod, jsonb, typescript, discriminated-union]
---

# drizzle-zod widens jsonb $type discriminated unions, breaking db.insert() types

## Problem

A Drizzle `jsonb` column typed with `.$type<T>()` where `T` is a Zod **discriminated union** compiles fine in the table definition, but `db.insert(table).values(row)` fails to typecheck. `createInsertSchema(table)` does not carry the `$type<T>` through — for `jsonb` it emits a permissive `z.ZodType<Json>` and drops the union's literal discriminant (e.g. `scoring.mode`). The lost literal then surfaces at the insert site as `'string' is not assignable to '"binary"'`, because the widened value no longer matches the table's `$inferInsert` type.

## Symptoms

- `npm run check` (tsc) fails on the insert call site, not on the schema definition:
  ```
  server/storage.ts(287,57): error TS2769: No overload matches this call.
    ... Types of property 'config' are incompatible.
      ... Types of property 'scoring' are incompatible.
        ... Type 'string' is not assignable to type '"binary"'.
  ```
- The table compiles; only the `insert(...).values(insertValue)` path errors.

## What Didn't Work

- Casting at the call site (`values(row as any)`) — hides the error but loses the validation the Zod schema exists to provide, and doesn't fix the exported `Insert*` type that other code consumes.
- Adding `.$type<T>()` was already present on the column; the problem is that `createInsertSchema` (drizzle-zod) maps `jsonb` to a loose Zod type and ignores `$type`, so the round-trip `createInsertSchema → z.infer` drops the literal.

## Solution

Pass a **field refinement** (second arg) to `createInsertSchema`, supplying the real Zod schema for the JSONB column so the inferred insert type preserves the discriminated-union literal:

```ts
// shared/schema.ts
import { campaignConfigSchema, type CampaignConfig } from "./campaignConfig";

export const campaigns = pgTable("campaigns", {
  // ...
  config: jsonb("config").$type<CampaignConfig>(),  // nullable, no DB default
});

// Plain createInsertSchema(campaigns) drops the discriminant (scoring.mode) and
// breaks db.insert(campaigns).values(...). Refine the jsonb field with the real
// Zod schema so the discriminated-union literal survives into InsertCampaign:
export const insertCampaignSchema = createInsertSchema(campaigns, {
  config: campaignConfigSchema.nullish(), // matches a nullable, default-less column
}).omit({ id: true, createdAt: true });
```

`tsc` then passes, and `InsertCampaign["config"]` is the precise `CampaignConfig | null | undefined` with `scoring.mode` as the literal union.

## Why This Works

drizzle-zod generates the insert schema from the Drizzle column *types*, and for `jsonb` it emits a permissive `z.ZodType<Json>` rather than reflecting `$type<T>`. The discriminated union's literal discriminant is therefore lost; the mismatch then surfaces at the insert site as `string` not being assignable to the literal. The refinement object lets you override the generated field with your own Zod schema; `z.infer` of that schema is the exact `T`, so the exported `Insert*` type and the table's `$inferInsert` agree again. `.nullish()` (`null | undefined`) matches a nullable column with no DB default, so existing rows can be `null` and `getX` can fall back to a default — `.optional()` alone would also typecheck, but `.nullish()` mirrors the shape drizzle-zod itself emits for a nullable-no-default column. (Version note: the bare-schema refinement is preserved verbatim in drizzle-zod 0.7.0 — a future version that auto-wraps bare refinements like it does the callback form could double-wrap `.nullish()`.)

## Prevention

- For any `jsonb().$type<T>()` column whose `T` is a union/discriminated union (or otherwise non-trivial), **refine it in `createInsertSchema(table, { col: realSchema })`** rather than relying on the generated shape.
- Keep the JSONB's Zod schema as the single source of truth (here `campaignConfigSchema`) and reuse it both for the column `$type`, the insert refinement, and runtime `safeParse` on reads/writes.
- A cheap guard: a unit test that `someSchema.safeParse(DEFAULT_VALUE).success === true` catches drift, and `npm run check` catches the widening at the insert site.

## Related Issues

- [Destructive Drizzle migrations vs the auto-deploy](../workflow-issues/drizzle-destructive-migration-vs-auto-deploy-2026-05-29.md) — same `shared/schema.ts` / `db:push` surface, deploy-timing angle.
- Drizzle versions at time of writing: `drizzle-orm ^0.39.3`, `drizzle-zod ^0.7.0`, `zod ^3.24.2`.
