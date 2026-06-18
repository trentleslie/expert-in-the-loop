---
title: "feat: Reviewer-page UX + editable campaign fields"
type: feat
status: active
date: 2026-06-17
origin: docs/brainstorms/2026-06-17-reviewer-page-and-campaign-edit-requirements.md
---

# feat: Reviewer-page UX + editable campaign fields

## Overview

Three independent improvements (one branch, separate commits):

1. **Edit campaign fields after creation** — add Name, Description, and Reviewer Instructions to the Configure Campaign dialog, and extend `PATCH /api/campaigns/:id` (today it accepts only `status`) plus a new storage method to persist them. Note in the Create dialog that campaign type is permanent.
2. **Reviewer instructions at top, expanded** — move the instructions panel above the source/target comparison cards on the review page and default it expanded.
3. **Confirmation toggle** — a per-reviewer Switch next to the response buttons that disables the vote/skip confirmation dialog; default ON, persisted in localStorage.

## Problem Frame

See origin: `docs/brainstorms/2026-06-17-reviewer-page-and-campaign-edit-requirements.md`. After a campaign is created its reviewer instructions can't be edited anywhere (the instructions field exists only in the Create dialog; the Configure Campaign dialog renders only the scoring/display config editor, and the PATCH route ignores every field except `status`). On the review page, instructions are buried in a collapsed accordion below the comparison cards. The vote/skip confirmation dialog is mandatory, costing experienced reviewers throughput.

## Requirements Trace

- R1. Admins can edit a live campaign's name, description, and reviewer instructions from the Configure Campaign dialog; reviewers see updated instructions.
- R2. Campaign type is communicated as non-editable at creation time.
- R3. Reviewer instructions render at the top of the review page, expanded by default (respecting a saved collapse preference).
- R4. Reviewers can toggle the confirmation dialog off; default ON, persisted per-browser, applies to both vote and skip.

## Scope Boundaries

- No inline editing of instructions on the reviewer page — editing stays in the admin Configure Campaign dialog.
- Campaign **type** stays create-only (downstream effects on pairs); only surface a note.
- No changes to routing, data-fetching architecture, scoring/consensus logic, or roles (campaign editing stays `requireAdmin`).
- Toggle and panel state are per-browser (localStorage), not per-account.

## Context & Research

### Relevant Code and Patterns

- `server/routes.ts:155` — `PATCH /api/campaigns/:id` (currently `status`-only, `requireAdmin`).
- `server/routes.ts:174` — `PUT /api/campaigns/:id/config` (config save + recompute; the details edit must NOT trigger recompute).
- `server/storage.ts:39-40` — `updateCampaignStatus` / `updateCampaignConfig`; **no** general details-update method exists.
- `shared/schema.ts:205` — `insertCampaignSchema`; `instructions` is `text` (schema.ts:37). Create-side validation in `client/src/pages/admin/campaigns.tsx:82` caps instructions at 2000 chars.
- `client/src/pages/admin/campaigns.tsx:424` — `EditConfigDialog` (the "Configure Campaign" popup). Loads `fullCampaign` via single-string detail key `['/api/campaigns/${id}']`, `staleTime:0`. Saves config via PUT; confirms recompute when `hasVotes`.
- `client/src/pages/admin/campaigns.tsx:148` — `CreateCampaignDialog`; campaign-type field at line 245 (`CampaignTypeCombobox`), instructions field at 261.
- `client/src/pages/review.tsx:594-674` — Accordion holding the `instructions` panel (collapsed) then `llm-reasoning`, rendered after the comparison cards.
- `client/src/pages/review.tsx:250-262` — `expandedPanels` state seeded from localStorage key `review-expanded-panels`; persisted via effect.
- `client/src/pages/review.tsx:265-273,363-379,381-427` — `pendingVote`/`pendingSkip` state, `handleBinaryVote`/`handleNumericVote`/`handleSkip` (set pending → dialog), `confirmVote`/`confirmSkip` (run mutations), and keyboard-shortcut Enter handler (~427).
- `client/src/components/ui/switch.tsx` — shadcn Switch to use for the toggle.
- Test style: `server/campaignMembership.test.ts`, `client/src/lib/campaignFocus.test.ts` — vitest pure-logic/Zod tests. No RTL/supertest/DOM env, so UI behavior is verified manually; extract pure helpers where testable.

### Institutional Learnings

- `docs/solutions/logic-errors/getqueryfn-querykey-footgun-2026-06-01.md` and `.../single-string-querykey-escapes-list-prefix-invalidation-2026-06-02.md` — single-string detail keys (`['/api/campaigns/${id}']`) do NOT prefix-match a `['/api/campaigns']` invalidation; the review page uses a separate array detail key `['/api/campaigns/${id}', 'detail', id]`. After saving edits, invalidation must explicitly cover both detail keys or edits look reverted / stale on the review page.

### External References

- None — well-patterned local React/shadcn + Express/Drizzle work.

## Key Technical Decisions

- **Separate details update from config save.** Editing name/description/instructions must never trigger evidence recompute. Add a dedicated storage method + PATCH path; keep the config PUT/recompute flow untouched.
- **Reuse PATCH `/api/campaigns/:id`, dispatch on body shape — with explicit precedence.** The current handler reads `req.body.status` and 400s *unconditionally* when it isn't a valid status enum, so a details-only body is rejected before any new code runs. The guard must move *inside* a status branch. Control flow: if `status` is present → validate enum (400 on invalid), update status; else if any of `name`/`description`/`instructions` is present → parse with `updateCampaignDetailsSchema`, update details; else → 400. A body carrying **both** `status` and detail fields → 400 (ambiguous; reject rather than guess). Validate the details body with a new `updateCampaignDetailsSchema`. Partial update — only provided fields are written.
- **Details get their own "Save details" action, independent of config save.** Editing name/description/instructions is a separate button + mutation + success toast, decoupled from the config Save (which carries the recompute-confirm modal). This avoids the partial-save trap where details commit silently while the admin cancels the recompute prompt. After a successful details PATCH, invalidate both the admin detail key and the review-page detail key so instructions refresh everywhere.
- **Refactor the vote/skip submit path so the value is passed explicitly.** Today `confirmVote`/`confirmSkip` read `pendingVote`/`pendingSkip`. To support the toggle-off (no-dialog) path, extract a submit function that takes the vote value directly; both the dialog path and the direct path call it. This avoids relying on pending state that won't be set when confirmation is off.
- **Default-expanded via init default, not forced.** `expandedPanels` initializes to `["instructions"]` only when no saved value exists; a saved preference (including a deliberate collapse) wins.

## Open Questions

### Resolved During Planning

- Which fields editable? Name, description, instructions (not type). — origin doc.
- Toggle scope/persistence? Both vote+skip, localStorage, default ON. — origin doc.
- Storage method exists? No — must add one (verified `server/storage.ts`).

### Deferred to Implementation

- Exact names of the new storage method and Zod schema.
- Exact `.max()` for `description` (5000 is a starting point) and the precise toggle label string — both are easy to adjust during implementation.

## Implementation Units

- [ ] **Unit 1: Server — persist campaign detail edits**

**Goal:** Allow name/description/instructions to be updated for an existing campaign.

**Requirements:** R1

**Dependencies:** None

**Files:**
- Modify: `shared/schema.ts` (add `updateCampaignDetailsSchema`: `name` `.min(1).max(255).trim()`; `description` `.max(5000).nullable().optional()`; `instructions` `.max(2000).nullable().optional()`. Coerce empty/whitespace-only `description`/`instructions` to `null` so the review page never renders a blank panel — see Unit 4)
- Modify: `server/storage.ts` (add `updateCampaignDetails(id, fields)` to interface + `DatabaseStorage`)
- Modify: `server/routes.ts` (restructure `PATCH /api/campaigns/:id` per the dispatch precedence in Key Technical Decisions)
- Test: `shared/campaignDetails.test.ts` (or co-locate with existing schema tests)

**Approach:**
- New Zod schema validates the details body. Route control flow follows the explicit precedence in Key Technical Decisions (status branch / details branch / 400 for both-or-neither).
- **Mass-assignment guard:** the storage method's Drizzle `set()` is built from an explicit allowlist of exactly `{name, description, instructions}` — never by spreading the parsed body or `req.body`. This prevents a client from overwriting `campaignType`, `createdBy`, `recomputeStatus`, `config`, or `status` through the details path (the create-side `insertCampaignSchema` already omits server-managed fields; the update path needs the same discipline).

**Patterns to follow:** `updateCampaignStatus`/`updateCampaignConfig` in `server/storage.ts`; existing `requireAdmin` route handlers in `server/routes.ts`; `insertCampaignSchema`'s `.omit()` discipline in `shared/schema.ts`.

**Test scenarios:**
- Happy path: valid `{name, description, instructions}` parses; all three round-trip through the schema.
- Edge case: empty/whitespace `description`/`instructions` coerce to `null`; omitted fields allowed (partial).
- Edge case: instructions of exactly 2000 chars accepted; 2001 rejected. `name` of 255 accepted; 256 rejected.
- Error path: empty/whitespace-only `name` rejected (after trim).
- Route (manual or light integration): details-only body no longer 400s; a present-but-invalid `status` still 400s; a body with both `status` and detail fields → 400; an empty/unrecognized body → 400.

**Verification:** Schema tests pass; manual — PATCH with details persists and is returned by `GET /api/campaigns/:id`; PATCH with `status` still works; a details body containing an extra column (e.g. `campaignType`) does not mutate that column.

- [ ] **Unit 2: Admin — editable fields in Configure Campaign dialog**

**Goal:** Add Name, Description, Reviewer Instructions to the Configure Campaign dialog and save them.

**Requirements:** R1

**Dependencies:** Unit 1

**Files:**
- Modify: `client/src/pages/admin/campaigns.tsx` (`EditConfigDialog`)

**Approach:**
- Seed controlled state for name/description/instructions from `fullCampaign` when the dialog opens (mirror the existing config `useEffect`).
- Render the three fields (Name input, Description textarea, Instructions textarea — reuse Create-dialog copy/limits) above the `CampaignConfigEditor`, in their own section with a dedicated **"Save details"** button + mutation, separate from the existing config Save.
- The details mutation PATCHes `/api/campaigns/:id` with `{name, description, instructions}`, shows its own success/error toast, and never touches the recompute path. Disable "Save details" while its mutation is pending; surface PATCH errors inline/as a toast (don't swallow). Client-mirror the server validation (Name required) so the button can disable on empty Name with a visible reason.
- On details-save success: invalidate the admin detail key `['/api/campaigns/${id}']` AND the review-page detail key `['/api/campaigns/${id}', 'detail', id]`, plus the existing `['/api/campaigns']` list prefix (see Institutional Learnings).
- The existing config Save (with recompute confirm) stays exactly as-is.

**Patterns to follow:** existing `saveMutation`, `onUpdate`/`handleRefresh` invalidation, and the `useEffect` seeding in `EditConfigDialog`; Create-dialog field markup and helper copy.

**Test scenarios:** Test expectation: none (UI wiring; no component test harness) — covered by manual verification.

**Verification:** Manual — edit each field, "Save details", reopen → values persist; the review page for that campaign shows updated instructions without a hard reload; the config Save / recompute flow is unaffected; clearing instructions makes the review-page panel disappear (not blank).

- [ ] **Unit 3: Admin — note that campaign type is permanent**

**Goal:** Tell admins at creation that type can't be changed later.

**Requirements:** R2

**Dependencies:** None

**Files:**
- Modify: `client/src/pages/admin/campaigns.tsx` (`CreateCampaignDialog`, campaign-type FormField ~line 245)

**Approach:** Add muted helper text under the Campaign Type field (same style as the instructions helper text at line 277).

**Patterns to follow:** the `<p className="text-xs text-muted-foreground">` helper under the instructions field.

**Test scenarios:** Test expectation: none — static copy.

**Verification:** Manual — note is visible in the Create dialog.

- [ ] **Unit 4: Review — instructions panel at top, expanded by default**

**Goal:** Surface reviewer instructions prominently.

**Requirements:** R3

**Dependencies:** None

**Files:**
- Modify: `client/src/pages/review.tsx`

**Approach:**
- Render the Campaign Instructions panel in its own Accordion **above** the source/target comparison cards (keep the LLM Reasoning panel where it is).
- Change the `expandedPanels` init so that, when no `review-expanded-panels` value is stored, it defaults to include `"instructions"`. A stored preference wins.
- Omit the panel when the campaign has **no instructions, treating null and empty/whitespace-only as "none"** (so an admin clearing the field via Unit 2 makes the panel disappear rather than showing a blank expanded accordion). With Unit 1 coercing empty→null this is a null check, but guard the empty-string case defensively.
- **Render instructions as React text content only** (the existing `{campaign.instructions}` interpolation). Do not introduce `dangerouslySetInnerHTML` or a markdown parser that emits raw HTML; if rich text is ever wanted it needs its own security review.

**Patterns to follow:** existing Accordion/AccordionItem usage at `review.tsx:594-674`; localStorage init/persist at `review.tsx:250-262`.

**Test scenarios:** *(extract the default-state resolver into a tiny pure helper to make it testable, mirroring `client/src/lib/campaignFocus.ts`)*
- Happy path: no stored value → default includes `"instructions"`.
- Edge case: stored value without `"instructions"` (user collapsed it) → stays collapsed.
- Edge case: malformed/empty stored JSON → falls back to default without throwing.

**Verification:** Manual — a campaign with instructions opens with them expanded at the top; collapsing and reloading keeps them collapsed.

- [ ] **Unit 5: Review — confirmation toggle next to response buttons**

**Goal:** Let reviewers disable the vote/skip confirmation dialog.

**Requirements:** R4

**Dependencies:** None

**Files:**
- Modify: `client/src/pages/review.tsx`
- Create: `client/src/lib/reviewPreferences.ts` (pure read/write + default for the confirm-before-submit flag)
- Test: `client/src/lib/reviewPreferences.test.ts`

**Approach:**
- New localStorage key (e.g. `review-confirm-before-submit`), default `true`. Helper reads/parses with a safe default and writes on change.
- Render a Switch directly below the voting controls / Skip row (`review.tsx:725-749`), with a **visible** `Label` (suggested text: **"Confirm before submitting"**) associated via `htmlFor`/`id` so the switch has an accessible name and a real hit target (shadcn `Switch` has no built-in label).
- Refactor the submit path: extract a function that takes the vote value (or skip) and runs the mutation directly, reading `reviewerNotes`/`expertSelectedCode` from state at call time (not a stale closure). When confirmation is ON, `handleBinaryVote`/`handleNumericVote`/`handleSkip` set pending state (dialog) as today; when OFF, they call the submit function directly.
- **Keyboard path:** the existing Enter handler (`review.tsx:427`) only *confirms an open dialog* — when confirmation is OFF there is no dialog, so Enter simply has nothing to confirm. It's the score/skip shortcut keys themselves that must honor the toggle (submit directly when OFF, open the dialog when ON). Clarify the plan's intent accordingly — there is no new Enter behavior to add.
- **Accidental-vote guards (no-confirm mode):** an accidental vote is **recoverable** — the vote-history page already lets reviewers edit a past vote, which supersedes it via `PATCH /api/pairs/:id/vote` (`client/src/pages/vote-history.tsx`, `EditVoteDialog`). So the only added guard needed is ignoring auto-repeat in the keydown handler (`if (e.repeat) return`) alongside the existing `isSubmitting` guard, so a held/rapidly-repeated key can't chain-vote onto the next pair. No cooldown or undo affordance is needed.
- **Selection feedback:** `ScoringControls` derives its selected-button highlight from `pendingVote` (`review.tsx:730,732`). In no-dialog mode `pendingVote` is never set, so the chosen control won't visually register before the pair advances. This is acceptable (the pair refetches immediately and a success toast fires) — call it out so the implementer treats it as intended rather than a bug.

**Patterns to follow:** `client/src/lib/campaignFocus.ts` + its test for the localStorage helper; existing `confirmVote`/`confirmSkip` mutation calls; `switch.tsx`.

**Test scenarios:**
- Happy path: unset storage → default `true` (confirmation on).
- Happy path: stored `false` → returns `false`; round-trips after write.
- Edge case: malformed stored value → safe default `true` without throwing.

**Verification:** Manual — toggle OFF then vote/skip submits immediately with no dialog (including via keyboard); toggle ON restores the dialog; setting persists across reload; default is ON for a fresh browser.

## System-Wide Impact

- **Interaction graph:** Editing a campaign's instructions affects the review page (separate query key) — invalidation must reach it (Unit 2). The submit-path refactor (Unit 5) touches both button clicks and the keyboard handler.
- **State lifecycle risks:** Details PATCH must not invoke the config recompute path. Cache invalidation must cover both detail keys to avoid stale/reverted-looking edits.
- **API surface parity:** `PATCH /api/campaigns/:id` gains fields but keeps the `status` contract intact. The body-shape dispatch must reject ambiguous (both status + details) and empty bodies with 400.
- **Trust boundary:** details PATCH stays `requireAdmin`; the storage allowlist is the guard against mass-assignment of server-managed columns. Instructions remain rendered as React text content (no raw-HTML sink).
- **Unchanged invariants:** Scoring/consensus logic, routing, role gates (`requireAdmin`), and the config PUT/recompute flow are unchanged.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Edited instructions look reverted on the review page (querykey footgun) | Invalidate both the admin single-string detail key and the review array detail key; cite solution docs (Unit 2). |
| Details edit accidentally triggers recompute | Keep details on a separate PATCH path, isolated from the config PUT (Units 1–2). |
| Toggle-off path relies on pending state that isn't set | Refactor submit to take the value explicitly (Unit 5). |
| Existing reviewers with saved panel prefs don't see instructions expanded | Accepted per origin doc — saved preference wins; only fresh state defaults expanded. |
| Details PATCH 400s because the route validates `status` unconditionally | Restructure dispatch precedence; status guard moves inside the status branch (Unit 1). |
| Mass-assignment: client overwrites server-managed columns via details PATCH | Storage `set()` built from an explicit `{name, description, instructions}` allowlist, never a body spread (Unit 1). |
| Unbounded `name`/`description` (stored bloat / app-layer DoS) | `.max()` caps + `.trim()` in `updateCampaignDetailsSchema` (Unit 1). |
| No-confirm mode → held/repeated key chain-votes across pairs | `e.repeat` guard + existing `isSubmitting` guard (Unit 5); accidental votes are correctable via the vote-history Edit/supersede flow, so no undo/cooldown needed. |
| Instruction edits apply to reviewers mid-session (judging rules change under them) | Accepted — editing live campaigns is the intended behavior; documented as a residual risk. Votes cast before/after an edit are not version-tagged. |
| Admin clears instructions → blank expanded panel on review page | Coerce empty→null (Unit 1); treat null-or-empty as "no instructions" when omitting the panel (Unit 4). |

## Documentation / Operational Notes

- No schema migration: `instructions`, `name`, `description` columns already exist (`shared/schema.ts`). No `npm run db:push` needed.

## Sources & References

- **Origin document:** `docs/brainstorms/2026-06-17-reviewer-page-and-campaign-edit-requirements.md`
- Related code: `server/routes.ts:155`, `server/storage.ts:39`, `client/src/pages/admin/campaigns.tsx:424`, `client/src/pages/review.tsx:594`
- Institutional learnings: `docs/solutions/logic-errors/getqueryfn-querykey-footgun-2026-06-01.md`, `docs/solutions/logic-errors/single-string-querykey-escapes-list-prefix-invalidation-2026-06-02.md`
