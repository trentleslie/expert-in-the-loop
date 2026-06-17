# Reviewer Page & Campaign Editing Improvements — Requirements

**Date:** 2026-06-17
**Status:** Ready for planning
**Scope:** Standard (three independent, well-bounded UI/API changes)

## Problem

Three usability gaps on the campaign admin and reviewer surfaces:

1. **Reviewer instructions (and name/description) can't be edited after a campaign is created.** The instructions field only appears in the Create Campaign dialog. The Configure Campaign popup renders only the scoring/display config editor, and `PATCH /api/campaigns/:id` accepts only `status` — every other field in the request body is silently ignored.
2. **Reviewer instructions are buried.** On the review page they sit in a collapsible accordion below the source/target comparison cards, collapsed by default, so reviewers often don't see them.
3. **The vote/skip confirmation dialog is mandatory.** Every vote and skip routes through an `AlertDialog`. Experienced reviewers have no way to turn it off and lose throughput to the extra click.

## Goals

- Let admins edit a campaign's reviewer instructions, name, and description after creation.
- Make reviewer instructions prominent and visible by default on the review page.
- Let reviewers opt out of the per-action confirmation dialog, with the choice remembered.

## Non-Goals

- Editing campaign **type** after creation (downstream effects on pairs). Instead, surface a note at creation time that type is permanent.
- Inline editing of instructions directly on the reviewer page (editing stays in the admin Configure popup).
- Changing routing, data-fetching, or scoring/consensus logic.
- Role changes — campaign editing remains admin-only (`requireAdmin`).

## Requirements

### 1. Editable campaign fields in the Configure Campaign popup

- The Configure Campaign dialog (`client/src/pages/admin/campaigns.tsx`, the config-editor dialog that renders `CampaignConfigEditor`) gains editable fields for:
  - **Name** (required, matches Create dialog constraints)
  - **Description** (optional)
  - **Reviewer Instructions** (optional, max 2000 chars — same as Create dialog)
- Fields pre-populate with the campaign's current values.
- Saving persists these alongside the existing config save. Acceptance: after saving and reopening, edited values are shown; the review page reflects updated instructions.
- `PATCH /api/campaigns/:id` (server, `requireAdmin`) is extended to accept and persist `name`, `description`, and `instructions`, with server-side validation (name non-empty; instructions ≤ 2000). It must keep working for the existing `status`-only callers.
- **Create Campaign dialog:** add a short note near the campaign-type field stating the type cannot be changed after the campaign is created.

### 2. Reviewer instructions — top of page, expanded by default

- On the review page (`client/src/pages/review.tsx`), the Campaign Instructions panel moves **above** the source/target comparison cards.
- It defaults to **expanded** when the reviewer has no saved preference.
- Existing localStorage persistence of panel expand/collapse state is preserved: a reviewer who collapses it keeps it collapsed across reloads. Only the default (no stored value) changes to expanded.
- When a campaign has no instructions, the panel is omitted (unchanged from today).

### 3. Confirmation-popup toggle next to response buttons

- A toggle control sits next to the voting/skip response buttons, labeled to convey "confirm before submitting."
- **Default: ON** (confirmation enabled) — preserves current behavior for new/unset reviewers.
- Scope: applies to **both** vote and skip confirmations.
- Persistence: per-browser via localStorage (consistent with the existing `review-expanded-panels` pattern). Survives reloads.
- When **OFF**: selecting a vote or skip executes the action immediately, with no `AlertDialog`. Keyboard-shortcut paths honor the same setting.

## Affected Surfaces (for planning reference)

- `client/src/pages/admin/campaigns.tsx` — Configure dialog fields; Create dialog type note.
- `server/routes.ts` — `PATCH /api/campaigns/:id` field handling.
- `server/storage.ts` — campaign update method (verify it supports name/description/instructions, not just status).
- `client/src/pages/review.tsx` — instructions panel position/default; confirmation toggle + gated vote/skip flow.

## Success Criteria

- An admin can change a live campaign's instructions, name, and description from the Configure popup, and reviewers see the updated instructions.
- Campaign type is shown as non-editable, with the constraint communicated at creation.
- A reviewer opening a campaign with instructions sees them expanded at the top without scrolling.
- A reviewer can disable the confirmation dialog; the preference persists across reloads and applies to both voting and skipping; default remains ON.

## Open Questions

None outstanding. All product decisions resolved during brainstorming.
