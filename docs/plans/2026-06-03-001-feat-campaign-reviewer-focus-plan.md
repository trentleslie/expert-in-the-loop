---
title: "feat: Campaign Reviewer Focus — link-based reviewer↔campaign membership"
type: feat
status: active
date: 2026-06-03
origin: docs/brainstorms/2026-06-03-campaign-reviewer-focus-requirements.md
---

# Campaign Reviewer Focus — link-based reviewer↔campaign membership

## Overview

Add a lightweight reviewer↔campaign **membership** so the right experts land on the right campaigns without wading through the whole pool. A campaign has a **shareable link**; opening it (including through a Clerk sign-in round-trip) **joins** the user to that campaign and drops them into review. The reviewer home leads with **joined** campaigns and keeps a **Browse all** view available. Admins copy the link and see a **roster** of who joined. A one-time **backfill** seeds membership from existing reviewers so nothing regresses.

This is **focus, not access control** — the data stays a collective pool; any signed-in user can still reach any campaign via Browse all. **Join is intentional-only**: opening a link joins; reviewing ad hoc from Browse all does not.

## Problem Frame

Today the app is flat: `GET /api/campaigns` (`server/routes.ts`) returns *all* campaigns to any authenticated user via `storage.getCampaignsWithStats()`; the reviewer home (`client/src/pages/home.tsx`) lists every active campaign; `next-pair` is `requireAuth`; there is **no membership/assignment concept** in `shared/schema.ts`. That was fine for ~9 trusted people in one org. As the user base broadens (now `@phenomehealth.org` + `@buckinstitute.org`, with non-admin reviewers), reviewers need a focused default. (See origin: `docs/brainstorms/2026-06-03-campaign-reviewer-focus-requirements.md`.)

**Decoupled from the in-flight Google→Clerk production cutover** — this ships as a follow-on; it is not a promotion prerequisite.

## Requirements Trace

- R1. Shareable campaign link; opening it (incl. via Clerk sign-in, preserving the campaign target) **joins** the user and lands them in review.
- R2. **Intentional-only join** — reviewing from Browse all does NOT join.
- R3. Joining is not a permission gate; any active campaign is still reachable via Browse all.
- R4. Reviewer home leads with **joined** campaigns; **Browse all** one click away.
- R5. No-joined-campaigns empty state with a Browse-all entry (never a dead end).
- R6. Admins can copy a campaign's shareable link.
- R7. Admins can see the **roster** of who has joined / is reviewing each campaign (membership-derived, so it includes joined-but-not-yet-voted).
- R8. One-time **backfill**: existing reviewers associated with campaigns they've voted in (distinct active-vote reviewers).
- R9. Admins continue to see/manage all campaigns; joined-filtering applies only to the reviewer home.

## Scope Boundaries

- No org-level tenancy / data segregation — collective pool by design.
- No per-campaign access control — membership is organizational, not permission. The link **directs**, it does not **restrict** (campaign id is not a secret).
- No reviewer-groups, no admin manual add/remove, no link revocation/expiry, no admin "coverage" (who-was-sent-but-hasn't-started) view — all future directions.
- No per-reviewer "done/in-progress" card state in v1 (cards show campaign-level progress as today) — see Deferred to Implementation.

### Deferred to Separate Tasks

- **Production rollout of this feature** (the same db:push + backfill sequence on `expertloop`): a separate step, after — and independent of — the Clerk production cutover. v1 ships to `dev` only.

## Context & Research

### Relevant Code and Patterns

- **Membership table** → mirror `skippedPairs` in `shared/schema.ts` (composite-unique junction: `id uuid` PK, FK columns, `unique().on(...)`). The `users.id` FK **must** use `{ onUpdate: "cascade" }` like every other `users.id` FK (the Clerk ID-migration re-points `users.id`; a non-cascade FK breaks login for joined users).
- **Backfill SQL** → mirror `scripts/migration-002-archive-existing.sql` (idempotent `BEGIN/COMMIT`, header block, `-- Verification` queries).
- **Routes** → `server/routes.ts`: `POST /api/pairs/:id/skip` (thin handler, `getAuth(req).userId!`, storage call) is the template for the join route; `GET /api/campaigns` for the scoped query; `GET /api/analytics/campaigns/:id/reviewers` for the admin roster route. Guards `requireAuth` / `requireAdmin` from `server/auth.ts`.
- **Storage** → `server/storage.ts`: declare methods in the `IStorage` interface first; idempotent insert via `.onConflictDoNothing()` (as `skippedPairs` at ~L709); explicit `db.select().innerJoin(...)` style. `getReviewerStats` (~L1196) is **vote-derived** — the roster needs a new membership-derived query.
- **Reviewer home** → `client/src/pages/home.tsx`: `useQuery(["/api/campaigns"])` + client-side `status==="active"` filter + `<CampaignCard>` + the existing empty-state Card. Partition over the existing payload (no heavy new endpoint).
- **Admin link-copy** → `client/src/pages/admin/campaigns.tsx` `<CampaignCard>` dropdown (Configure/Activate/Export…) + `useToast`; `navigator.clipboard.writeText(...)`.
- **Clerk + routing** → `client/src/App.tsx` (ClerkProvider, `<SignIn>` in `ClerkSignInPage`, wouter routes, `ProtectedRoute`). `signInFallbackRedirectUrl="/"` currently defeats R1 — drive the post-sign-in target off the `<SignIn>` redirect props.

### Institutional Learnings

- **`docs/solutions/logic-errors/getqueryfn-querykey-footgun-2026-06-01.md`** — the default `getQueryFn` fetches `queryKey[0]` only. **Every new query here (`/api/users/me/campaigns`, roster) must use a single-string key that IS the URL.** A multi-segment key silently hits the list endpoint (200, wrong shape).
- **`docs/solutions/logic-errors/single-string-querykey-escapes-list-prefix-invalidation-2026-06-02.md`** — single-string keys are **not** reached by `["/api/campaigns"]` list-prefix invalidation. **The join mutation must explicitly invalidate every affected key** — `["/api/campaigns"]` (browse-all) **and** `["/api/users/me/campaigns"]` (joined set), and any roster key.
- **`docs/solutions/workflow-issues/drizzle-destructive-migration-vs-auto-deploy-2026-05-29.md`** — CI never runs `db:push`/SQL. The new table is **additive** (safe `db:push`, drops nothing) but **must exist before the new code restarts**, or scoped queries 500. Run the manual sequence on `expertloop_dev` for the `dev` push (and later `expertloop` for prod).
- **`docs/solutions/best-practices/clerk-auth-migration-express-react-2026-05-06.md`** — auth is Clerk JWT; do **not** reintroduce server sessions. Scope membership by `getAuth(req).userId`. Wouter needs a catch-all for Clerk subpaths. Pre-existing users may carry legacy Google `sub` ids — the membership FK references `users.id` (whatever the find-or-create settled), and the backfill joins on that id, so it stays correct through the ID migration (FK is `onUpdate:cascade`).
- **`docs/solutions/build-errors/drizzle-zod-jsonb-type-widening-2026-05-29.md`** — only relevant if the membership table had a `jsonb().$type<union>()` column. It won't (flat scalars) — **N/A**, noted for completeness.

## Key Technical Decisions

- **Membership is an explicit table** (`campaign_memberships`: campaign × user, unique → idempotent), written **on link-open only**. Not vote-derived going forward (the link-clicked-but-not-yet-voted case needs a stored row); seeded once at rollout from votes (R8).
- **Home filtering is client-side over the existing `["/api/campaigns"]` payload** + a thin `GET /api/users/me/campaigns` returning **joined campaign ids** (`string[]`). Lighter than a second full-campaign endpoint and keeps Browse-all a pure client view (fits focus-not-access).
- **Join only `active` campaigns** (403 for draft / completed / archived) — matches the active-only reviewer home, so no dead/invisible memberships (a draft- or archived-joined campaign would never surface under "Your campaigns"). JoinPage shows a "not open" message instead of entering review.
- **Roster is a new membership-derived query** (`campaign_memberships ⋈ users`), surfaced via a dialog from the admin campaign card — distinct from the vote-derived analytics Reviewers tab (which stays as-is).
- **Single-string query keys + explicit dual invalidation** on join (per the two TanStack learnings) — non-negotiable.
- **Home layout = stacked sections** ("Your campaigns" then "Browse all"), not tabs — simpler, and the empty-state slots in naturally.

## Open Questions

### Resolved During Planning

- Link form (raw URL vs token)? → **Raw URL** `/<origin>/campaigns/:id/join` (no security need; revocation is a deferred future direction).
- Sign-in round-trip mechanics? → Drive the post-sign-in target off the `<SignIn>` redirect props (not `signInFallbackRedirectUrl`); use the `clerk` skill (clerk-react-patterns) at implementation time. Wouter catch-all for Clerk subpaths already required.
- Roster surface? → New membership-aware endpoint + a dialog from the admin campaign card (keeps vote-derived analytics intact).
- Home layout? → Stacked sections over the existing payload + a `/api/users/me/campaigns` id list.
- Archived-campaign link behavior? → 403 on join; JoinPage shows a closed-campaign message.

### Deferred to Implementation

- **Per-reviewer card states** (joined-not-started / in-progress / done) on the home — needs the reviewer's own active-vote count vs available pairs per campaign; v1 shows campaign-level progress as today, a follow-up polish.
- Exact `@clerk/react` redirect **prop name** (`forceRedirectUrl` vs `redirectUrl`) — the capture-and-restore *structure* is decided in Unit 5; only the prop name is confirmed at implementation via the `clerk` skill.

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

**Join flow (R1):**

```mermaid
flowchart TD
  A[Admin copies link<br/>/campaigns/:id/join] --> B[Expert opens link]
  B --> C{Signed in?}
  C -- no --> D[Clerk SignIn<br/>target preserved] --> E[returns to /campaigns/:id/join]
  C -- yes --> E
  E --> F[JoinPage mounts → POST /api/campaigns/:id/join]
  F --> G{campaign open?}
  G -- archived/completed --> H[403 → 'campaign closed' message]
  G -- ok --> I[membership upsert<br/>ON CONFLICT DO NOTHING]
  I --> J[invalidate ['/api/campaigns'] + ['/api/users/me/campaigns']]
  J --> K[redirect to /review/:id]
```

**Data model (new table only):** `campaign_memberships(id uuid pk, campaign_id uuid → campaigns.id, user_id varchar → users.id ON UPDATE CASCADE, joined_at timestamptz, UNIQUE(campaign_id, user_id))`.

## Implementation Units

- [ ] **Unit 1: `campaign_memberships` schema + types**

**Goal:** Define the membership table, insert schema, and types.

**Requirements:** R1, R7, R8

**Dependencies:** None.

**Files:**
- Modify: `shared/schema.ts`

**Approach:**
- Add `campaignMemberships` pgTable mirroring `skippedPairs`: `id` uuid PK (`gen_random_uuid()`), `campaignId uuid().references(() => campaigns.id).notNull()`, `userId varchar({length:255}).references(() => users.id, { onUpdate: "cascade" }).notNull()`, `joinedAt timestamp().defaultNow().notNull()`, table-extra `unique().on(table.campaignId, table.userId)`.
- Add `insertCampaignMembershipSchema = createInsertSchema(...).omit({ id:true, joinedAt:true })`, `CampaignMembership` / `InsertCampaignMembership` types. `relations()` optional (codebase uses explicit joins).

**Patterns to follow:** `skippedPairs` table + `insertSkippedPairSchema` in `shared/schema.ts`; the `{ onUpdate: "cascade" }` on every `users.id` FK.

**Test scenarios:**
- Test expectation: none — pure schema/type definitions; behavior is exercised by Units 2–4. `npm run check` must pass (drizzle-zod types resolve).

**Verification:** `npm run check` clean; the table compiles into the Drizzle schema with the composite unique.

- [ ] **Unit 2: Storage methods + API routes (join, joined-set, roster)**

**Goal:** Server surface for joining, reading one's joined set, and the admin roster.

**Requirements:** R1, R2, R4, R7

**Dependencies:** Unit 1.

**Files:**
- Modify: `server/storage.ts` (interface + `DatabaseStorage`)
- Modify: `server/routes.ts`
- Test: `server/campaignMembership.test.ts` (pure-logic only — see scenarios)

**Approach:**
- `storage.joinCampaign(campaignId, userId)` → `db.insert(campaignMemberships).values({...}).onConflictDoNothing()` (idempotent).
- `storage.getJoinedCampaignIds(userId): string[]` → select `campaignId` where `userId = ?`.
- `storage.getCampaignRoster(campaignId)` → `campaignMemberships ⋈ users` returning `{ userId, email, displayName, joinedAt }` (includes joined-not-voted).
- Routes:
  - `POST /api/campaigns/:id/join` (`requireAuth`, `userId = getAuth(req).userId!`; 404 if missing; **403 unless `status === 'active'`** — draft/completed/archived are not joinable, matching the active-only home so no dead/invisible memberships accrue; else join → `{ success:true }`).
  - `GET /api/users/me/campaigns` (`requireAuth`) → the caller's joined campaign ids. **Named under `/api/users/me/*` (like `/api/users/me/votes` / `/stats`) deliberately — a `/api/campaigns/mine` path is shadowed by the existing `GET /api/campaigns/:id` (Express matches `:id="mine"` first).**
  - `GET /api/campaigns/:id/roster` (`requireAdmin`) → roster. **The cited analytics reviewers route is `requireAuth`; this one must be `requireAdmin` — do not copy the template's guard.**

**Patterns to follow:** `POST /api/pairs/:id/skip` + `storage` skip insert (`.onConflictDoNothing()`); `GET /api/analytics/campaigns/:id/reviewers`; archived guard at `routes.ts` next-pair.

**Test scenarios:**
- Happy path (logic): the join-eligibility predicate — only `status==='active'` is joinable; draft / completed / archived are rejected (extract the check into a tiny pure helper and unit-test it).
- Edge case (DB-backed, verify on dev): joining the same campaign twice creates exactly one membership row (`onConflictDoNothing`).
- Integration (verify on dev): `getCampaignRoster` returns a reviewer who joined but has **zero votes** (the gap the vote-derived analytics misses).
- Note: DB-backed behavior is verified by exercising on `expertloop_dev` (the repo has no DB test harness; this matches the project's established verification approach). Pure predicates ARE unit-testable — `server/*.test.ts` already run under vitest (`server/evidenceStatus.test.ts`, `server/authMigration.test.ts`), so the test file executes.

**Verification:** join is idempotent; `/api/users/me/campaigns` returns the caller's joined ids; roster includes joined-not-voted; non-admin gets 403 on roster; archived join → 403.

- [ ] **Unit 3: One-time backfill migration**

**Goal:** Seed memberships from existing active-vote reviewers so the joined-first home isn't empty on rollout.

**Requirements:** R8

**Dependencies:** Unit 1 (table must exist when this runs).

**Files:**
- Create: `scripts/migration-003-backfill-campaign-memberships.sql`

**Approach:**
- Idempotent `BEGIN/COMMIT` with header block. Seed from each **active** campaign's distinct active-vote reviewers:
  `INSERT INTO campaign_memberships (id, campaign_id, user_id, joined_at) SELECT gen_random_uuid(), p.campaign_id, v.user_id, now() FROM votes v JOIN pairs p ON p.id = v.pair_id JOIN campaigns c ON c.id = p.campaign_id WHERE v.is_active = true AND c.status = 'active' GROUP BY p.campaign_id, v.user_id ON CONFLICT (campaign_id, user_id) DO NOTHING;`
- `GROUP BY` over **`is_active`** votes (the column is `votes.is_active` — confirmed in `shared/schema.ts`; supersession chain → never row counts). The `c.status='active'` join keeps the backfill consistent with the active-only join guard / home (no seeded-but-invisible memberships). `votes` has no `campaign_id`, so the `pairs` join is required. End with `-- Verification` counts.

**Patterns to follow:** `scripts/migration-002-archive-existing.sql`.

**Test scenarios:**
- Test expectation: none (SQL data migration). Verified on `expertloop_dev`: membership row count == `SELECT count(*) FROM (SELECT DISTINCT p.campaign_id, v.user_id FROM votes v JOIN pairs p ON p.id=v.pair_id WHERE v.is_active) t`; re-running the script changes nothing (idempotent).

**Verification:** row-count parity on dev; second run is a no-op.

- [ ] **Unit 4: Reviewer home — joined-first + Browse all**

**Goal:** Reorganize the reviewer home into "Your campaigns" (joined) + "Browse all", with an empty state.

**Requirements:** R3, R4, R5, R9

**Dependencies:** Unit 2 (`/api/users/me/campaigns`).

**Files:**
- Modify: `client/src/pages/home.tsx`
- Create: `client/src/lib/campaignFocus.ts` (pure partition helper)
- Test: `client/src/lib/campaignFocus.test.ts`

**Approach:**
- Add `useQuery<string[]>({ queryKey: ["/api/users/me/campaigns"] })` — **single-string key**. Partition `activeCampaigns` via a pure `partitionByMembership(active, joinedIds)` → `{ joined, others }`. Render "Your campaigns" (joined) then "Browse all" (others) reusing `<CampaignCard>`; empty-state Card when `joined` is empty (R5), still showing Browse all.
- **Dedup (resolved): a joined campaign appears only under "Your campaigns", never in Browse all.** Browse all = active campaigns *not* in the joined set. The home already filters to `status==='active'`, so archived/completed are never shown to reviewers at all (the join 403 guards only the direct-link path). Admin home is unchanged (R9 — the partition is reviewer-only; admins keep the full unfiltered list, no role branch needed in the partition since admins don't use this scoped query).

**Patterns to follow:** existing `home.tsx` query + `activeCampaigns` filter + `<CampaignCard>` + empty-state Card.

**Test scenarios:**
- Happy path: `partitionByMembership([A,B,C], [A.id]) → { joined:[A], others:[B,C] }`.
- Edge case: empty `joinedIds` → `{ joined:[], others:all }`; empty campaigns → both empty.
- Edge case: a joined id not in the active list (archived since join) is omitted from both (no dangling card).
- Integration (verify on dev): joining a campaign (Unit 5) then returning to home shows it under "Your campaigns" without a manual refresh (invalidation works).

**Verification:** joined campaigns lead; Browse all lists the rest; empty state is clean; no duplicate cards.

- [ ] **Unit 5: Shareable-link join flow (route + JoinPage + Clerk redirect)**

**Goal:** Opening `/campaigns/:id/join` joins (through sign-in if needed) and lands in review.

**Requirements:** R1, R2

**Dependencies:** Unit 2 (join endpoint).

**Files:**
- Modify: `client/src/App.tsx` (new route; Clerk `<SignIn>` redirect target; wouter catch-all for Clerk subpaths if not already present)
- Create: `client/src/pages/join.tsx` (JoinPage)

**Approach:**
- Add `<Route path="/campaigns/:id/join">` rendering `JoinPage`.
- **🔴 Preserve the target across sign-in — this is structural, not a prop lookup.** Today `ProtectedRoute` does `<Redirect to="/login" />` (wouter), which **drops** the original `/campaigns/:id/join` *before Clerk ever sees it*, and `signInFallbackRedirectUrl="/"` then lands the user on home — so R1's unauth path is currently impossible to satisfy by tweaking `<SignIn>` props. Fix the bounce to **carry the intended path**: gate `JoinPage` with Clerk's own `<SignedIn>` / `<SignedOut>` rather than the generic `ProtectedRoute`, e.g. `<SignedOut><RedirectToSignIn forceRedirectUrl={`/campaigns/${id}/join`} /></SignedOut>`, so Clerk returns to the join URL after auth. (Also: `PublicRoute` bounces already-signed-in users away from `/login` → `/`, so do not route the deep link through `/login`.) The exact prop name (`forceRedirectUrl` vs `redirectUrl`) is confirmed against the installed `@clerk/react` via the `clerk` skill — but the **capture-and-restore structure is the real work**.
- `JoinPage` (signed in): fire the join mutation **once** — guard the mount effect with a ran-once ref so React 18 StrictMode / remounts don't double-POST or double-navigate (the DB write is idempotent, the navigation is not). `onSuccess` → `invalidateQueries(["/api/campaigns"])` **and** `invalidateQueries(["/api/users/me/campaigns"])` → `setLocation(`/review/${id}`)`. On **403 (not active)** → show a "this campaign isn't open" message + link home. Brief loading state while joining.

**Execution note:** Use the `clerk` (clerk-react-patterns) skill for the sign-in redirect — but treat the **ProtectedRoute/RedirectToSignIn capture-and-restore** as the load-bearing change, not the prop name. This is R1's one genuinely unproven cross-layer flow; verify the unauth path end-to-end on dev.

**Patterns to follow:** wouter route + `ProtectedRoute` + `useParams` in `App.tsx`/`review.tsx`; the mutation+invalidation pattern in `admin/campaigns.tsx` `handleRefresh`.

**Test scenarios:**
- Happy path (verify on dev): signed-in user opens the link → joins → lands on `/review/:id`; the campaign appears under "Your campaigns" on home.
- Error path (verify on dev): opening a link to an **archived** campaign → 403 → closed-campaign message, not a broken review screen.
- Edge case (verify on dev): **unauthenticated** open → Clerk sign-in → returns to the campaign and joins (not the generic home). This is R1's core path.
- Edge case: re-opening an already-joined link is a no-op join and still lands in review (idempotent).
- Pure logic (unit-test if a helper is extracted): the post-sign-in redirect URL builder preserves `/campaigns/:id/join`.

**Verification:** the full link → (sign-in) → join → review path works for both new and signed-in users; archived links are handled gracefully.

- [ ] **Unit 6: Admin — copy link + roster**

**Goal:** Admins get a copy-link action and a roster of who has joined each campaign.

**Requirements:** R6, R7

**Dependencies:** Unit 2 (roster endpoint).

**Files:**
- Modify: `client/src/pages/admin/campaigns.tsx`

**Approach:**
- Add a **"Copy share link"** `<DropdownMenuItem>` to the campaign card: `navigator.clipboard.writeText(\`${window.location.origin}/campaigns/${campaign.id}/join\`)` + `toast({ title: "Link copied" })`.
- Add a **"Reviewers" / roster** `<DropdownMenuItem>` opening a `<Dialog>` that queries `GET /api/campaigns/:id/roster` (**single-string key** `` [`/api/campaigns/${id}/roster`] ``) and lists `displayName · email · joinedAt`. Add `data-testid`s.

**Patterns to follow:** existing dropdown items + `<Dialog>` (CreateCampaignDialog/EditConfigDialog) in `admin/campaigns.tsx`; `useToast`.

**Test scenarios:**
- Happy path (verify on dev): copy action writes the correct `/campaigns/:id/join` URL and toasts.
- Happy path (verify on dev): roster dialog lists joined reviewers, including one who joined but hasn't voted.
- Edge case: empty roster → a clean "no one's joined yet" state.

**Verification:** admins can copy a working link and view an accurate, membership-derived roster.

## System-Wide Impact

- **Interaction graph:** new `POST /join` writes membership; the home reads `/api/users/me/campaigns`; the join mutation must invalidate `["/api/campaigns"]` + `["/api/users/me/campaigns"]`. No change to voting/skip/next-pair behavior.
- **Error propagation:** archived/closed join → 403 surfaced as a friendly JoinPage message; missing campaign → 404; non-admin roster → 403.
- **State lifecycle risks:** membership write is idempotent (`onConflictDoNothing` on the composite unique) — repeat link-opens are safe. The new table is additive; `db:push` won't drop existing tables.
- **API surface parity:** none — join is a single new path; agents/automation aren't involved.
- **Integration coverage:** the join→home-refresh path (invalidation) and the unauth→sign-in→join path are the two cross-layer flows that unit tests won't prove — verify on dev.
- **Unchanged invariants:** `GET /api/campaigns` still returns all (Browse all + admin rely on it); roles/gating unchanged; collective-pool access unchanged (no campaign is hidden — only the *default home view* is filtered).

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| New table absent when code restarts → scoped queries 500 | `db:push` the table on `expertloop_dev` **before** merging (merge is the last step — see Operational Notes); CI never migrates. |
| `GET /api/campaigns/mine` shadowed by `GET /api/campaigns/:id` → "Your campaigns" always empty | Endpoint named `/api/users/me/campaigns` (under the existing `/api/users/me/*` prefix) — no `:id` route to shadow it. |
| Unauth deep-link drops the campaign target before Clerk (R1 fails) | Unit 5 reworks the bounce to capture-and-restore the path (`RedirectToSignIn forceRedirectUrl`), not just `<SignIn>` props; verify the unauth path on dev. |
| Draft-campaign join creates an invisible "dead" membership | Join guard allows only `status==='active'`; backfill likewise restricted to active campaigns. |
| Multi-segment query key silently hits the wrong endpoint (getQueryFn footgun) | All new queries use **single-string keys** (`/api/users/me/campaigns`, `/api/campaigns/:id/roster`). |
| Join doesn't refresh the home (single-string key escapes list-prefix invalidation) | Join `onSuccess` invalidates **both** `["/api/campaigns"]` and `["/api/users/me/campaigns"]` explicitly. |
| Membership `userId` FK not cascade → Clerk ID migration FK-violates, breaks login for joined users | FK declared `{ onUpdate: "cascade" }` like every other `users.id` FK. |
| Unauthenticated deep link drops user on generic home (R1 fails) | Drive the post-sign-in target off `<SignIn>` redirect props (not `signInFallbackRedirectUrl`); verify the unauth path on dev; use the `clerk` skill. |
| Backfill double-counts via the vote supersession chain | `DISTINCT`/`GROUP BY` over `is_active` votes only, `ON CONFLICT DO NOTHING`. |

## Documentation / Operational Notes

- **Rollout sequence (dev, manual — CI does not migrate; the `dev` branch auto-deploys on push, so the order is load-bearing):**
  1. On the box (`cd ~/expert-in-the-loop-dev`), `npm run db:push` against `expertloop_dev` — creates `campaign_memberships` (additive; harmless to the running old code, which doesn't reference it).
  2. Run `scripts/migration-003-backfill-campaign-memberships.sql` on `expertloop_dev` + verify row-count parity.
  3. **Only then merge the PR.** Its auto-deploy restarts the service onto the new code against the already-existing table. **Merging before step 1 opens a 500 window** on `/api/users/me/campaigns` + roster until someone runs `db:push`.
- **Production:** the identical sequence on `expertloop` is a **separate task**, after and independent of the Clerk cutover (this feature is decoupled).
- **PR workflow:** ships as its own feature branch → PR → Greptile → `dev` (per project workflow; no direct-to-dev for feature code).
- No `CLAUDE.md`/`/servers` changes required.

## Sources & References

- **Origin document:** [docs/brainstorms/2026-06-03-campaign-reviewer-focus-requirements.md](docs/brainstorms/2026-06-03-campaign-reviewer-focus-requirements.md)
- Learnings: `docs/solutions/logic-errors/getqueryfn-querykey-footgun-2026-06-01.md`, `docs/solutions/logic-errors/single-string-querykey-escapes-list-prefix-invalidation-2026-06-02.md`, `docs/solutions/workflow-issues/drizzle-destructive-migration-vs-auto-deploy-2026-05-29.md`, `docs/solutions/best-practices/clerk-auth-migration-express-react-2026-05-06.md`
- Code: `shared/schema.ts` (`skippedPairs`), `server/routes.ts`, `server/storage.ts`, `client/src/pages/home.tsx`, `client/src/App.tsx`, `client/src/pages/admin/campaigns.tsx`, `client/src/lib/queryClient.ts`
