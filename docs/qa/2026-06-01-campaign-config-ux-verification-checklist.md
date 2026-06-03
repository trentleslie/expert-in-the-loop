---
title: "QA Verification Checklist: Campaign Config UX fixes (PR #8)"
type: qa-checklist
date: 2026-06-01
verifies: PR #8 (merge 68ccc06) — 15 original findings + Greptile export fix + 2 follow-ups
predecessor: docs/qa/2026-05-29-generalization-ui-qa-checklist.md
plan: docs/plans/2026-06-01-001-fix-campaign-config-ux-plan.md
scope: Confirm the merged fixes behave correctly on dev (dev.expertintheloop.io / port 5001)
---

# QA Verification — Campaign Config UX fixes (PR #8)

This is a **verification** pass: PR #8 is merged to `dev`, so each item below confirms a
specific fix actually works on the deployed dev app (not a hunt for new issues).
🔴 = highest-value (data integrity / security). Original finding numbers in `[#N]`.

## 0. Pre-flight

- [ ] **Confirm dev redeployed with PR #8.** Merge commit `68ccc06`. If the behaviors below match the *old* app, the GitHub Actions dev deploy may still be running — check Actions before logging a "fail".
- [ ] You're on **dev** (port 5001), as **admin**.
- [ ] Have a **binary** campaign and a **numeric** campaign (range >10, e.g. 1–20) with pairs imported from `docs/qa/fixtures/qa-metabolite-pairs.csv`. Numeric campaign is essential — several fixes are numeric-specific.

## 1. Config editor (`admin/campaigns`)

- [x] 🔴 **[#5] No more config clobber (the headline).** Take a campaign with **non-default** config (custom labels + external links ON + `linkTemplate` + minVotes 1). Open **Configure** → the editor shows the **saved** values, not defaults. Change **one** field → Save → reopen: only that field changed, everything else persisted. *(This is the data-loss fix — verify carefully, ideally cross-check the DB.)* — **PASS (2026-06-02).** Verified on test4 (minVotes 1 / confirm 50 / reject 70). Changed `showExternalLinks`→ON + `linkTemplate`; DB confirmed the change persisted AND consensus stayed 1/50/70 (no clobber). Surfaced + fixed a reopen-staleness regression — see log row R1.
- [x] **Open-by-default + descriptions.** Create a campaign → "Configure scoring & display" is **expanded**, with a one-line description under each section. — **PASS (2026-06-02).** Expanded by default; descriptions present. Side fix (R2): clarified the same-source import-filter copy — relabeled "Filter imports by source prefix" → "Drop same-source pairs" + helper (commit `f08376e`).
- [x] **[#1] minVotes warning.** `minVotes ≥ 2` shows the "needs N distinct reviewers / pairs stay in review" helper; `minVotes 1` shows nothing. — **PASS (2026-06-02).** Correct polarity: warning at ≥2, nothing at 1.
- [x] **[#13] Numeric threshold defaults.** Switch scoring to **numeric** → confirm/reject thresholds are pre-filled (reject < confirm, within range), not empty. — **PASS (2026-06-02).** Pre-filled (4/2 on the default 1–5 seed). Enhancement R3: thresholds now **follow the range** — seeded 2/4 was stale after widening to 1–20; now re-seeds to 7/14 when the range changes and thresholds are untouched (commit `e5f5d27`).
- [x] **[#4] Chevrons** read collapsed = down, expanded = up (same as the review accordion). — **PASS (2026-06-02).** Correct direction collapsed/expanded. R3 range-follow also verified live (1–20 → 14/7, manual edits preserved).

## 2. Review flow (`review.tsx`)

- [x] 🔴 **[#15] Slider commits on release.** Numeric campaign (range >10) → **slider**. **Dragging does NOT open the confirm dialog**; the dialog appears once when you release on a value. — **PASS (2026-06-02).** Drag is silent; dialog fires once on release.
- [x] **[#2] Target-only external link.** With `showExternalLinks` + `linkTemplate`, only the **target** ID is a link; the **source** ID is plain text (no bogus `hmdb.ca/<sourceId>`). — **PASS (2026-06-02).** Target linkified, source plain text.
- [x] **[#3] No duplicate confidence.** LLM confidence appears **only** inside the expanded "LLM Reasoning" panel — not always-visible below it. — **PASS (2026-06-02).** Confidence shown once, inside the panel.
- [x] Vote buttons show the campaign's **configured labels**. — **PASS (2026-06-02).**

## 3. Vote history (`vote-history.tsx`)

- [x] **[#10] Configured vote labels.** Badges + edit-dialog buttons show the campaign's labels (e.g. `Match / No Match / Unsure`), **not** "Confirmed / Rejected / Unsure". — **PASS (2026-06-02).** Labels reflect campaign config. Enhancement R4: added per-card **campaign-name badge** + **campaign filter dropdown** (commit `6be5510`).
- [x] **(follow-up) Numeric edit uses config.** Edit a **numeric** vote → the score control reflects the campaign's **actual range + labels** (slider for large range), **not** a hardcoded 1–5 with "1 = Unrelated, 5 = Exact match". — **PASS (2026-06-02).** Edit dialog uses the campaign's real range (slider for 1–20) + labels. R4 (campaign badge + filter) verified live.
- [x] **[#11] No stale-after-navigate.** Edit a vote → navigate away and back → vote history reflects the change **without a manual refresh**. — **PASS (2026-06-02).**

## 4. Results browser (`admin/results`)

- [x] **[#6] Three-count votes column (binary).** Binary campaign: votes column shows **reject / unsure / accept**; a disputed-by-unsure pair reads **`0 / 1 / 0`**, not `0/0`. — **PASS (2026-06-02).**
- [x] **(Greptile follow-up) Numeric votes column.** Numeric campaign: the votes column shows the **plain vote count** (e.g. `5`), **not** `0 / N / 0` (every vote mislabeled unsure). — **PASS (2026-06-02).** Plain count. Enhancement R5: numeric campaigns now show a **Mean** column (AVG of scores) in place of the N/A Agreement % (commit `a650312`).
- [x] **[#14] Detail-dialog metadata.** Open a pair → the dialog renders source/target **metadata badges** (`kegg_id` / `pubchem_cid` / `curator_note`). — **PASS (2026-06-02).** Badges render. R5 mean column verified live; binary Agreement % unchanged.
- [x] 🔴 **[#10/§10] XSS inert.** Open SRC010 → `<img src=x onerror=alert(1)>` (reasoning) and `<script>…</script>` (curator_note) render as **literal text**; no alert, no broken image. — **PASS (2026-06-02).** Verified on SRC010 (test2): `curator_note` shows literal `<script>alert('xss')</script>` as visible text; no alert, no execution.
- [x] **[#4] Empty-filter state.** Filter to a zero-count tier → "No pairs with status…" + Clear. — **PASS (2026-06-02).**

## 5. Export (`admin/results` → Export)

- [x] 🔴 **[#8] JSON complete + envelope.** Export **JSON** → top-level `{campaign, exportedAt, total, pairs:[…]}`, and each pair carries `evidence_status`, `resolution_layer`, `unsure_votes`, `reviewer_notes`. — **PASS (2026-06-02).** test4_export.json: envelope keys exact, total 14 == pairs len, all four per-pair fields present.
- [x] **[#9] TSV.** TSV is a format option; downloads tab-delimited and opens cleanly. — **PASS (2026-06-02).** test4_export.tsv: 20 tab-delimited cols, 0 commas, parses cleanly.
- [x] **Whole-campaign scope.** Apply an on-screen filter, then export → the file still contains the **whole** campaign (all formats). — **PASS (2026-06-02).** With a consensus filter active, re-exported CSV/TSV/JSON all held 14 rows (full campaign). Server export takes only campaignId (routes.ts:502).
- [x] 🔴 **CSV/TSV injection neutralized.** A reviewer note `=1+1` exports as `'=1+1`. — **PASS (2026-06-02).** Code-verified: `neutralize` (regex `/^[=+\-@\t\r]/` → prefix `'`) runs on every string cell via csv-stringify `cast`; unit test `exportSerializer.test.ts:141` asserts `'=1+1` in CSV+TSV. test4 data had no formula cells to show live.
- [x] **(Greptile fix) Numeric export coherence.** Export a **numeric** campaign → `positive_rate` is **empty** (N/A, not `0.000`), binary counts are `0`, and **`mean_score`** holds the mean of scores. — **PASS (2026-06-02).** test6 export: positive_rate empty throughout, pos/neg/unsure all 0, mean_score 13.000 for the 1 voted pair (vote=13), empty for unvoted. Matches R5 Mean column.
- [x] **Allowlist + auth.** `?format=xml` → 400; a non-admin request to `?format=json`/`tsv` → 403. — **PASS (2026-06-02).** `?format=xml` returned 400 `{"message":"Invalid format. Allowed: csv, tsv, json."}` live. Non-admin 403 guaranteed by `requireAdmin` on the route (routes.ts:483) — not exercised live (tester is admin).

## 6. Analytics (Campaign Analytics)

- [x] 🔴 **[#12] Sections render (was the queryFn footgun).** Select a campaign with votes → **Vote distribution, Reviewers, Disagreements, Skips** tabs all show their data — **none blank**. — **PASS (2026-06-02).** All four tabs render rich data (screenshots): tier dist + donuts + activity, reviewer table, disagreement chart + 2 disputed pairs, skip stat cards.
- [x] **View Details** navigates to the campaign tab (no longer a no-op). — **PASS+IMPROVED (2026-06-02).** Worked, but UX reworked per user (R7): each card now has its own **View Details** button (one click → details); the **Campaign Details** tab is always navigable (was disabled w/o selection) and shows a "Select a campaign" empty state (commit `7d8ccd0`). **Verified live (2026-06-02).**
- [x] Skip stats show **`0`** (not blank) for a zero-skip campaign; tier bar fills the card width. — **PARTIAL→FIXED (2026-06-02).** Skip stats show 0/0/0% (not blank) ✅. Tier bar was **NOT** full width (bug R6: `stackOffset="expand"` vs `domain=[0,total]` → bar at 1/total width); fixed to `domain=[0,1]` (commit `9b6773a`) — **re-verified full-width live (2026-06-02).**

## 7. Stale-list freshness + archived isolation

- [x] **[#11] Import → review.** Activate a campaign, import pairs, open review → the **first pair is served without a manual refresh**. — **PASS (2026-06-02).**
- [x] **[#11] Vote → progress.** Cast a vote → Home progress + results reflect the new tier without refresh. — **PASS (2026-06-02).**
- [x] 🔴 **(carry-over) Archived isolation.** Editing a vote on an **archived** campaign → server **403** ("Campaign is not open for voting"); archived campaigns aren't offered for voting. — **PASS (2026-06-02).** test3 (archived) not offered for voting; editing its vote rejected with 403.

## 8. Carried-over / never-verified (best-effort)

- [x] `showAlternatives` toggle actually shows/hides the alternatives panel on review. — **REWORKED (2026-06-02).** Toggle persists + correctly gates the expert-alternative control. Old behavior was a dropdown constrained to a parsed `alternatives`/`top_5_loinc` array (fixture had none). Per user (R8): replaced with a **free-text** "Suggest alternative match" input (still gated on `showAlternatives`); suggested alternatives now surface as ordinary displayed metadata columns. parseAlternatives + the parsed panel removed (commit `e7aff31`). **Verified live (2026-06-02):** box present when toggle on, typed value → "Expert suggestion: …" in vote history, box gone when toggle off, prior suggestions persist in history.
- [x] **Raw CSV upload path** (non-wizard) auto-dumps non-standard columns into metadata. — **CODE-VERIFIED (2026-06-02).** Logic correct (`routes.ts:283-307`): non-`STANDARD_COLS` columns → `extraMetadata` → `sourceMetadata`. **Caveat:** API-only — reachable solely by POSTing a multipart CSV file to `/api/campaigns/:id/pairs`; the wizard UI always posts pre-mapped JSON and never hits this branch, so there is no UI entry point for it.
- [x] PairDetailDialog vote-table **"Vote" column** shows the actual choice (Match/Unsure), not the scoring **mode** ("binary") — **PASS (2026-06-02).** Vote column shows the choice, not the mode.

---

## Verification log — dev run 2026-06-__

| # | Section | Result | Status |
|---|---------|--------|--------|
| #5 | 1. Config editor | Editor loads saved config; save persists; no clobber (DB-verified on test4) | ✅ PASS |
| R1 | 1. Config editor | **Regression found + fixed:** after the #5 single-string-key fix, the dialog's detail query `[/api/campaigns/:id]` is no longer covered by the `["/api/campaigns"]` list-prefix invalidation in `handleRefresh`. With global `staleTime:Infinity`, reopening after a save showed the **pre-save cache** (saved change looked reverted, though DB was correct). Fix: `staleTime:0` on the dialog query (commit `33f3b4c`). | ✅ FIXED |
| R2 | 1. Config editor | **UX copy:** same-source import filter relabeled "Filter imports by source prefix" → "Drop same-source pairs" + helper explaining the prefix list. Distinct from the dedup-against-existing step (`routes.ts:356+`). No behavior change (commit `f08376e`). | ✅ DONE |
| R3 | 1. Config editor | **Enhancement:** numeric consensus thresholds now follow the score range. Were seeded once on binary→numeric from the 1–5 default (2/4), leaving stale values after widening the range. Now re-seed from the new range when untouched (1–20 → 7/14); manual edits preserved (commit `e5f5d27`). | ✅ DONE |
| R4 | 3. Vote history | **Enhancement (user request):** vote cards now show a **campaign-name badge**, and a **campaign filter dropdown** appears when the user has voted in >1 campaign. Reuses the existing `/api/campaigns` query (widened to carry `name`); filter lists only voted-in campaigns + guards against a stale empty selection (commit `6be5510`). | ✅ DONE |
| R5 | 4. Results | **Enhancement (user request):** numeric campaigns now show a **Mean** column (AVG of numeric scores over active votes) replacing the N/A Agreement %. Server aggregation adds `meanScore` via `AVG(scoreNumeric)::float` (NULL for binary); binary campaigns unchanged (commit `a650312`). | ✅ DONE |
| R6 | 6. Analytics | **Bug found + fixed:** Evidence Tier Distribution bar rendered at ~1/total of the card width (narrow sliver). Cause: `stackOffset="expand"` normalizes the stack to [0,1] but the X-axis `domain` was `[0, total]`. Fixed to `domain={[0,1]}` so the bar fills the card with proportional segments (commit `9b6773a`). | ✅ FIXED |
| R7 | 6. Analytics | **UX rework (user request):** per-card **View Details** button (was: click card → click bottom-bar button); **Campaign Details** tab always navigable (was `disabled` w/o a selection) with a "Select a campaign" empty state; removed the redundant bottom selected-bar (commit `7d8ccd0`). | ✅ DONE |
| R8 | 2. Review (alternatives) | **UX rework (user request):** expert alternative override changed from a constrained dropdown (parsed `alternatives`/`top_5_loinc`) to a **free-text input** (still gated on `showAlternatives`); suggestions become ordinary metadata columns. Removed parseAlternatives + parsed panel (commit `e7aff31`). Decisions: keep gated on toggle; drop special handling. | ✅ DONE |

_Mark each item ✅/❌ as you go. Any ❌ becomes a new finding row here — same convention as the predecessor checklist. The fixture and its README live in `docs/qa/fixtures/`; remember to upload the **repo** CSV, never a Slack copy (rich-text strips the `<img>` payload)._
