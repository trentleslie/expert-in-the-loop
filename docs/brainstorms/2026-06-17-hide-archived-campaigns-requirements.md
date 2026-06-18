# Hide/Collapse Archived Campaigns — Requirements

**Date:** 2026-06-17
**Status:** Ready for planning
**Scope:** Lightweight (client-only UI change)

## Problem

The admin campaigns list shows archived campaigns (including test/junk ones) in a permanent "Archived Campaigns" section at the bottom, cluttering the view. Admins want to declutter without losing the campaigns or their data.

## Decision: hide, not delete

We considered a permanent hard-delete of archived campaigns but chose **collapsing/hiding** instead: it solves the actual problem (clutter) with near-zero risk — reversible, no cascade across `pairs`/`votes`/`skippedPairs`/`campaignMemberships`, no schema migration, and no irreversible loss of expert votes.

## Goal

Let admins collapse the Archived Campaigns section so it doesn't clutter the list, while keeping archived campaigns one click away.

## Non-Goals

- Permanent deletion of campaigns or their data (explicitly rejected for now).
- Any change to archiving/un-archiving behavior, the `GET /api/campaigns` payload, or the server/schema.
- Hiding non-archived statuses (active/draft/completed sections are unchanged).

## Requirements

- R1. The **Archived Campaigns** section renders as a clickable header showing the count, e.g. **"Archived Campaigns (3)"**, with an expand/collapse chevron.
- R2. The section is **collapsed by default** (declutter), with the archived campaign cards hidden until expanded.
- R3. The expanded/collapsed choice is **remembered per-browser** (localStorage), surviving reloads and future sessions — consistent with the existing review-page panel-persistence pattern.
- R4. When there are **no** archived campaigns, the section (and its header) is omitted entirely — unchanged from today.
- R5. Existing behavior inside the section (campaign cards, their actions) is unchanged when expanded.

## Success Criteria

- An admin with archived campaigns sees the list decluttered by default: a single "Archived Campaigns (N)" header instead of a wall of archived cards.
- Expanding the section reveals the archived cards; the choice persists across reloads and new sessions.
- An admin with no archived campaigns sees no archived section at all.

## Affected Surface (planning reference)

- `client/src/pages/admin/campaigns.tsx` — the "Archived Campaigns" section (~line 1031); grouping logic at ~line 958.

## Open Questions

None — all product decisions resolved (collapsible header collapsed-by-default, remembered across sessions).
