---
date: 2026-06-03
topic: campaign-reviewer-focus
---

# Campaign Reviewer Focus — link-based association

## Problem Frame

Today the app is **flat and fully shared**: `GET /api/campaigns` returns *all* campaigns to *any* authenticated user, the home page lists every active campaign, and any reviewer can open and vote on any active campaign (`/api/campaigns/:id/next-pair` is just `requireAuth`). Roles gate **management** (create/results/analytics/users/settings), not **visibility**. There is no campaign-membership/assignment concept in the schema.

That was fine for ~9 trusted people in one org. As the user base broadens (now spanning `@phenomehealth.org` + `@buckinstitute.org`, with non-admin reviewers signing up), the flat pool becomes a **focus problem**: different campaigns need different groups of expert reviewers, and reviewers shouldn't have to wade through every campaign to find the ones meant for them.

**This is about organizing attention, not restricting access.** Users remain one collective pool; no campaign is walled off by org. We want a lightweight way to get the right experts onto the right campaigns and make that the straightforward default.

**Not a blocker for the dev→main promotion.** The cutover can ship with today's flat model (the existing users are all admins and see everything). This feature lands afterward, when non-admin reviewers are onboarded.

## Requirements

**Association & joining**
- R1. Each campaign has a **shareable link** an admin can copy and send. Opening it: if the recipient is **not signed in**, they go through Clerk sign-in and are **returned to that campaign** (the campaign target is preserved across the sign-in round-trip) — they must never land on a generic empty home. Once authenticated they are **joined** to the campaign and dropped into its review flow. Net path for a new expert: link → sign-in → reviewing, in 1–2 clicks.
- R2. **Reviewing from Browse all is ad hoc** — opening and voting on a campaign reached via Browse all does **not** add it to "Your campaigns." Only an explicit **link-open joins** (R1). This keeps the joined home a clean reflection of the campaigns a reviewer was actually directed to, even as they occasionally explore the pool. *(Intentional-only join, chosen 2026-06-03.)*
- R3. Joining is **not a permission gate** — it only changes what surfaces by default. A reviewer can still reach and review any active campaign via Browse all (collective-pool principle preserved).

**Reviewer experience**
- R4. The reviewer home **leads with the campaigns they've joined**, with a **"Browse all active campaigns"** view one click away.
- R5. A reviewer with **no joined campaigns** sees a clear empty state plus the Browse-all entry — never a dead end.

**Admin experience**
- R6. Admins can obtain/copy a campaign's shareable link from the campaign management UI.
- R7. Admins can see the **roster** of who has joined / is reviewing each campaign (who's on what).

**Migration & compatibility**
- R8. On rollout, existing reviewers are **backfilled** as associated with the campaigns they've already voted in — nothing regresses, prior work still surfaces.
- R9. Admins continue to **see and manage all** campaigns regardless of association; the create/edit/results/analytics flows are unchanged. The joined-first filtering applies only to the **reviewer** home; the admin management list may additionally surface who has joined (see R7).

## Success Criteria

- A new expert who is sent a campaign link can sign in and start reviewing **the right campaign in 1–2 clicks**, without unrelated campaigns cluttering their default view.
- An admin can direct **different expert groups to different campaigns purely by sharing links** — no per-user setup.
- As the total campaign pool grows, a reviewer's home stays **focused on their campaigns**, while any campaign remains reachable via Browse all.

## Scope Boundaries

- **No org-level tenancy or data segregation** — one collective pool by design; campaigns are not restricted by org.
- **No hard access control** on campaigns — association is organizational/focus, not permission. (Archived/completed campaigns remain closed to voting as today.)
- **The link directs, it does not restrict.** Any signed-in user can Browse all and open/join any active campaign regardless of whether they received its link (the campaign id in the URL is not a secret). The shareable link is a *convenience for pointing the right experts at the right work*, not a gate. If true per-campaign restriction is ever needed, that's a separate feature (access control + tokenized, revocable links) — out of scope here.
- **Reviewer-groups** (named, reusable groups attached to a campaign) — not in v1; revisit if the same set repeatedly reviews many campaigns.
- **Admin manual add/remove of reviewers** — deferred; the shareable link is the primary join path for v1.
- **Link revocation / expiry / per-link analytics** — deferred; no security need in the collective-pool model.
- **Admin "coverage" view** ("who was sent the link but hasn't started") — a future direction, not v1. It needs per-reviewer/tokenized invites (a raw link leaves no record of who *received* it). v1's roster (R7) shows who has **joined/started**, not who's missing.

## Key Decisions

- **Shareable link as the join mechanism** — matches the "send the link out" mental model and needs near-zero admin overhead (no per-user picking).
- **Soft visibility (joined-first + browse-all)** — keeps the collective-pool principle while cutting clutter; preserves today's discoverability as a fallback.
- **Intentional-only join** — membership reflects deliberate direction (a link-open), not incidental exploration. Chosen so the joined-first home stays focused over time instead of slowly re-accreting the whole pool; reviewers can still review anything via Browse all without it sticking.
- **"Joined" is an explicit membership record** (campaign × user, unique → idempotent on repeat link-opens), written **on link-open** going forward — **not** on ordinary browse/vote activity (R2), and **not** derived purely from votes (the link-clicked-but-not-yet-voted case needs a stored record). Backfill (R8) seeds it **once at rollout** from each campaign's **distinct active-vote reviewers** (links didn't exist before) — votes use a supersession chain, so use `DISTINCT user_id` over `is_active` votes, not row counts.
- **Decoupled from the auth/schema cutover** — explicitly not a promotion prerequisite; ships as a follow-on.

## Dependencies / Assumptions

- Who may sign in at all is still gated by the **Clerk allowlist** (the org domains) — verified: the server has no independent domain check, so the allowlist is the only sign-in gate. Association is a post-authentication focus layer, not an access layer.
- New (non-existing) users default to `reviewer` (verified in `/api/auth/me` `createUser`); existing users keep their stored role. So link recipients who aren't pre-existing admins arrive as reviewers, which is the intended audience for this feature.
- A "joined" state must persist for someone who clicks a link but **hasn't voted yet** (so it shows on their home before any activity) — confirmed as a lightweight membership record in Key Decisions; the exact storage shape is a planning detail.
- **Cross-org data visibility is an accepted, deliberate tradeoff.** With one collective pool spanning `@phenomehealth.org` + `@buckinstitute.org`, any signed-in user from either org can read every active campaign's content (source/target text, imported metadata, pairs) and votes via Browse all. This is intended — but confirm the campaign/data owners of both orgs are aware before onboarding the second org's reviewers. The Clerk allowlist remains the **only** access gate, so keep its entries tightly scoped (strict domain match, not broad wildcards).

## Role × View (relationship)

| | Reviewer | Admin |
|---|---|---|
| Home default | **Joined campaigns** | Management view (all campaigns) |
| Browse all active | Available (1 click) | Yes |
| Join via link | Yes (auto on open) | N/A (sees all already) |
| See campaign roster | No | Yes (R7) |
| Copy/share campaign link | No | Yes (R6) |
| Create / manage / results / analytics | No | Yes (unchanged) |

## Outstanding Questions

### Resolve Before Planning
- _(none — the product decisions are settled above.)_

### Deferred to Planning
- [Affects R1][Technical] Link form: a **raw campaign-review URL** that auto-joins on first authenticated open, vs a **tokenized invite link** (enables future revoke/expiry). Recommendation: raw URL for v1; revisit only if revocation is ever needed.
- [Affects R1][Technical] **Sign-in round-trip mechanics** — how the campaign target survives the Clerk sign-in redirect (`redirect_url` / a post-auth param) so an unauthenticated link recipient lands back in the campaign, not a generic home. Load-bearing for R1's "1–2 clicks."
- [Affects R1][Design] **Link-state UX** — join-confirmation feedback ("You've joined X"), idempotent already-joined re-click, and what opening a link to an **archived/completed** campaign does (join + read-only vs no-op vs message).
- [Affects R8][Technical] Backfill is decided as DISTINCT active-vote reviewers (see Key Decisions) — confirm the query against the supersession-chain vote model (`is_active`, `superseded_by`).
- [Affects R7][Design] Where the admin roster surfaces — reuse the analytics **Reviewers** tab (note: it is **vote-derived**, so it won't show joined-but-not-voted reviewers — a membership-aware query is needed) vs a control on the campaign card.
- [Affects R4][Design] Home layout for "Your campaigns" vs "Browse all" — tabs vs stacked sections, counts, empty states (including zero active campaigns), whether a joined campaign also appears in Browse-all (dedup), and **per-reviewer card states** (joined-not-started / in-progress / done).

## Next Steps
-> `/ce:plan` for structured implementation planning (when you're ready to build this — it is decoupled from the promotion).
