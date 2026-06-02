---
title: "QA Checklist: Campaign Model Generalization & Evidence Tiers (UI)"
type: qa-checklist
date: 2026-05-29
plan: docs/plans/2026-05-28-001-refactor-campaign-model-generalization-plan.md
pr: trentleslie/expert-in-the-loop#7
scope: Manual UI verification of PR #7 (Units 6–11)
---

# QA Checklist — Campaign Model Generalization (UI)

Manual click-through verification for the campaign-model-generalization merge (PR #7, Units 6–11).
🔴 = highest-value checks — logic that's easy to get subtly wrong, worth extra scrutiny.

## 0. Pre-flight (do this first)

- [ ] **Confirm dev is actually migrated + running.** The merge is in the repo, but the evidence-tier model only appears after the manual migration sequence ran (stop service → Unit 1 SQL → `db:push` → archive SQL → build → start). Dev = `expertloop_dev` / port **5001**. If the new UI below is absent, it's likely not deployed yet — not a bug.
- [ ] You're on **dev**, not prod — you'll be creating throwaway test campaigns.

## 1. Campaign creation + Config Editor (Unit 8) — `admin/campaigns`

- [ ] Create campaign → **CampaignConfigEditor** appears below the basic fields.
- [ ] Scoring/Display sections **expanded** by default; Consensus + Import **collapsed**.
- [ ] 🔴 Switch scoring mode **binary → numeric → binary** — binary labels are **restored** (per-mode state preserved, not wiped).
- [ ] "**Preview as reviewer**" renders the actual reviewer buttons from current config.
- [ ] 🔴 **minVotes warning:** single-reviewer campaign at default `minVotes: 2` → warning that pairs will be stuck `in_review` for lack of reviewers. (Easiest real-world footgun.)
- [ ] Invalid config — `confirmPct > 100`, or a non-`https://` `linkTemplate` → submission **blocked client-side**.
- [ ] 🔴 **Edit config on a campaign that already has votes** → confirmation dialog shows **how many pairs will be recomputed** (a count, not a bare "Are you sure?"), then a real progress indicator, then success/failure.

## 2. Review flow (Unit 9) — `review.tsx`

- [x] Buttons show **the campaign's configured labels**, not hardcoded "Match/No Match/Unsure". ✓ (test4: No Match/Unsure/Match from config)
- [x] 🔴 **Numeric large range** (e.g. 1–50) → renders a **slider**, not an unusable wall of buttons. Small range (≤~10) = button row. ✓ (dev 2026-05-30: range 1–5 → button row; range >10 → **slider renders**). ⚠️ **but** slider auto-submits on drag — see finding #15.
- [ ] No leftover **per-vote binary/numeric toggle** (scoring mode is campaign-level now).
- [x] `showExternalLinks=true` + `linkTemplate=https://hmdb.ca/{targetId}` → link renders, opens new tab, URL-encoded ID. ✓ (render + `encodeURIComponent` confirmed; **but** see finding #2 — source ID wrongly linkified)
- [~] `showAlternatives` and `showMetadataPanel` toggles actually show/hide those panels. *(metadata panel ✓ shows bucketed kegg_id/pubchem_cid/curator_note; alternatives not yet exercised)*
- [x] Free-text **reviewer notes** available in both binary and numeric modes. ✓ (binary; notes field present, 0/500)

## 3. Vote immutability + supersession (Unit 4) — `vote-history.tsx`

- [x] 🔴 Edit a prior vote from vote-history → creates a **new** vote, old one shows as **"Superseded"** (not overwritten). Chain visible. ✓ (dev 2026-05-29, SRC005: old `match` row kept verbatim, `is_active=false` + `superseded_by` set; new `no_match` row active; UI shows greyed Superseded badge)
- [~] 🔴 After superseding, the **main review queue does NOT re-serve that pair** (supersession is audit-only). *(code-enforced: `storage.getNextPairForUser` excludes ANY vote, active or superseded — `server/storage.ts:446–453`; UI spot-check pending)*
- [x] 🔴 **Evidence status recomputes** after the edit — and is allowed to **regress**. ✓ (dev 2026-05-29: SRC005 `expert_confirmed` → `expert_rejected` after Match→No Match edit)

## 4. Results browser + PairDetailDialog (Unit 10) — `admin/results`

- [x] Each pair shows an **evidence-status badge** from stored data — each with **icon + color** (not color alone). ✓ (confirmed/rejected/disputed/unreviewed seen with distinct icon+color; in_review not present at minVotes:1)
- [x] 🔴 **Multi-select status filter** (e.g. "in_review OR disputed"), composes with search, filter state in the **URL** (reload/share preserves it). ✓ (dev 2026-05-29: Confirmed+Disputed checkboxes filtered correctly; **filter persists across reload**). ⚠️ footer reads "N match the status filter **on this page**" — verify filtering is server-side/global, not page-local (moot at 14 pairs/1 page).
- [x] Empty-filter state: "No pairs with status […]" + a **Clear** affordance — distinct from "campaign has no pairs." ✓ (dev 2026-05-30: "No pairs with status In Review on this page — adjust the filter")
- [x] PairDetailDialog: ≤2 votes shown flat; ≥3 collapses superseded under "(N) prior votes," active vote prominent. ✓ (dev 2026-05-30, SRC005 3-vote chain: "1 active, 2 superseded", active prominent, "Hide 2 prior votes" toggle). *(see also finding #14: dialog omits pair metadata; #10: per-vote row shows "binary" mode, not the Match/Unsure choice)*

## 5. Consensus math — 🔴 highest-value correctness check

Binary campaign, `confirmPct: 70`, `minVotes: 2`. Verify the **"unsure counts in the denominator"** rule:

- [~] 🔴 2 match + 1 unsure → **67% → disputed** — *3-voter case unreachable with 2 QA accounts.* Equivalent rule proven instead (dev 2026-05-29, test4, minVotes:1): a lone **unsure** vote → **disputed** (0% match, not confirmed), confirming unsure lands in the denominator rather than being dropped.
- [x] 1 vote only → stays **in_review** (minVotes gate) ✓ (test4: single match/no_match votes sat `in_review` under minVotes:2)
- [x] 3 match → **expert_confirmed** ✓ (equivalent under minVotes:1 — match→confirmed, no_match→rejected verified via config recompute)
- [x] Numeric: scores 4,5,4 with confirmThreshold 3.5 → **expert_confirmed**; scores 1,2,1 with rejectThreshold 2.0 → **expert_rejected**. ✓ (dev 2026-05-30, test5 minVotes:1 confirm≥3 reject≤2: score 5→confirmed, 4→confirmed, 2→rejected; vote-edit 1→4 re-tiered to confirmed)

## 6. Analytics + Home (Unit 10)

- [~] Analytics: **evidence-tier stacked bar** shows all 5 tiers in legend (0-count tiers muted, not missing). Numeric labels from config, not "Unrelated…Exact." *(dev 2026-05-30: tier distribution renders but not full-width/responsive; broader Analytics page is broken/incomplete — see finding #12)*
- [x] Home: campaign **progress bar = tier breakdown** (e.g. "98 confirmed, 31 rejected, 8 disputed"), not a flat percentage. ✓ (dev 2026-05-30, test4: "10 unreviewed · 1 confirmed · 1 rejected · 2 disputed")

## 7. Import (Unit 6) — `admin/upload`

> Test data: **`docs/qa/fixtures/qa-metabolite-pairs.csv`** (+ `fixtures/README.md`
> for the column→field mapping guide and which rows seed §2/§5/§8/§10). Renamed +
> extra columns are baked in to exercise the mapping wizard.

- [ ] Upload a CSV with **arbitrary column names** → unmapped columns land in metadata, nothing dropped. No forced LOINC fallbacks.
  - ⚠️ **Two import paths, two behaviors.** Raw CSV file upload: the server auto-dumps all non-standard columns into `sourceMetadata` (`routes.ts:283–289`) — "nothing dropped" holds. **Mapping wizard:** unmapped columns are *opt-in* — you must tick Source/Target in the **Additional Metadata Columns** section; anything left alone goes to **Ignored Columns** and is intentionally discarded (with an on-screen warning). This checklist line was written for the raw-CSV path.
- [x] `resolution_layer` is an optional mappable field; unmapped → pairs default to `unspecified`. ✓ (dev 2026-05-29: DB shows `unspecified` for all when `match_provenance` left unmapped)
- [x] **Duplicate detection** ✓ (dev 2026-05-29: re-importing the same file → `409`, `duplicateCount: 14`, `importedCount: 0`; no silent double-insert)
- [x] **Free-text pair type persists** ✓ (dev 2026-05-29: fixed value `metabolite` stored verbatim; no enum coercion)
- [x] **Mapped `resolution_layer` persists** ✓ (dev 2026-05-29, test4: `authoritative_xref`/`ai_assisted`/`manual` stored when `match_provenance` mapped; blank cells → `unspecified`)
- [x] **Metadata survival (wizard opt-in path)** ✓ (dev 2026-05-29, test2: `kegg_id`→target_metadata, `pubchem_cid`/`curator_note`→source_metadata; empty cells create no keys)
- [x] **XSS/injection payloads stored as inert text** ✓ (dev 2026-05-29, test4: `<img src=x onerror=alert(1)>` in reasoning + `<script>…</script>`/`=1+1`/`@SUM(...)` in metadata persisted verbatim — sets up §10 render check + §8 export check)

> ⚠️ **QA gotcha (not a product bug):** do NOT upload a fixture copied out of Slack — rich-text clients silently strip HTML like `<img onerror=…>`, which produced an empty cell and a 30-min phantom-bug chase. Always upload the repo file `docs/qa/fixtures/qa-metabolite-pairs.csv` directly. Also: the wizard's Resolution Layer dropdown defaults to unmapped; map `match_provenance` to it or every row defaults to `unspecified`.

## 8. Export (Unit 7)

- [x] Exported **CSV** has **evidence_status** + **resolution_layer** columns; consensus column = stored status (not recomputed). ✓ (CSV only — **JSON export omits both**, see finding #8)
- [x] 🔴 **CSV injection:** a cell starting with `=` or `+` (e.g. a reviewer note `=1+1`) → export **neutralizes it** (leading `'`). ✓ (dev 2026-05-29: reviewer note `=1+1` exported as `'=1+1`)

## 9. Archived-campaign isolation (Unit 11 — security boundary)

- [x] 🔴 Pre-cutover campaigns show as **archived** and aren't offered for new voting. ✓ (dev 2026-05-29: test3 archived; `getNextPairForUser` returns null for archived/completed — `storage.ts:441`)
- [x] 🔴 Vote on an archived pair via a **bookmarked/direct URL** → server **rejects** (archive enforced server-side, not just hidden in UI). vote-history on archived campaigns = read-only. ✓ (dev 2026-05-29: `PATCH /api/pairs/:id/vote` on archived test3 → **403 "Campaign is not open for voting"**)

## 10. XSS spot-check (do once)

- [~] Import a pair whose metadata/text contains `<img src=x onerror=alert(1)>` → renders as **literal text** everywhere (review, results, detail dialog), never executes. *(dev 2026-05-29, SRC010: `<img onerror>` in **PairDetailDialog** renders as inert italic text, no alert ✓. Still to confirm: the `<script>` curator_note badge on the **review** page, and review-page reasoning panel.)*

---

## QA findings — dev run 2026-05-29

| # | Section | Finding | Severity | Status |
|---|---------|---------|----------|--------|
| 1 | §1 Config editor | **minVotes advisory warning not implemented.** Editor has the `minVotes` input + Zod validation, but no warning when `minVotes ≥ 2` that pairs will sit in `in_review` without enough distinct reviewers. Specced in Unit 8; the consensus engine itself enforces minVotes correctly (unit-tested) — only the helper warning is missing. Fix: conditional muted helper text under the minVotes field when value ≥ 2. (`client/src/components/CampaignConfigEditor.tsx`) | low (UX) | open — batch fix |
| 2 | §2 Review — external links | **Source ID linkified with the target-namespaced template.** `EntityCard` applies the same `ExternalEntityLink` + `display.linkTemplate` to both source and target IDs (`client/src/pages/review.tsx:193–197`). Template placeholder is `{targetId}` (e.g. `https://hmdb.ca/{targetId}`), so the source ID produces a bogus link — `SRC005` → `https://hmdb.ca/SRC005`. Fix: only render the external link for the **target** entity, or add a separate optional source link template. | low–med (correctness/UX) | open — batch fix |
| 3 | §2 Review — LLM confidence | **Duplicate LLM confidence; the always-visible copy defeats the bias-warning design.** Confidence renders twice: once *inside* the collapsible LLM Reasoning accordion (`review.tsx:742–765`, hidden until expanded — correct), and again *always-visible* below via `ConfidenceIndicator` (`review.tsx:777–781`). The whole point of collapsing LLM reasoning behind a "form your own judgment first" warning is anti-anchoring — but showing the confidence % unconditionally leaks the strongest LLM signal anyway. Fix: remove the always-visible `ConfidenceIndicator` block (777–781); keep only the in-accordion one. | med (defeats bias mitigation) | open — batch fix |
| 4 | App-wide — disclosure chevrons | **Inconsistent collapse-chevron convention.** Create-campaign config editor uses a custom `Collapsible` with collapsed=`ChevronRight` → expanded=`ChevronDown` (`CampaignConfigEditor.tsx:69`). Review page uses shadcn `Accordion`, whose chevron is collapsed=down → expanded=up (rotates). Two different idioms in one app. Pick one convention and apply throughout. | low (nitpick/consistency) | open — batch fix |
| 6 | §4 Results — votes column | **Unsure votes invisible in the results table → "0/0 but Disputed" reads as contradictory.** The Votes column shows only positive/negative (green/red), so a pair disputed by a lone unsure vote shows `0/0` (e.g. SRC011). The PairDetailDialog already shows a three-count breakdown. Fix: show three counts in the table **in reject/unsure/accept order (red / neutral / green) to match the review buttons (No Match · Unsure · Match)** — SRC013=`1/0/0`, SRC011=`0/1/0`, SRC005=`0/0/1`. | low–med (UX/consistency) | open — batch fix |
| 8 | §8 Export — JSON incomplete + path divergence | 🔴 **JSON export silently drops the core evidence-tier outputs.** CSV export is server-side and complete (`routes.ts:487–509`); JSON export is built **client-side** from `/results` data (`client/src/pages/admin/results.tsx:558–581`) and omits `evidence_status`, `resolution_layer`, `unsure_votes`, `expert_selections`, `reviewer_notes`. Programmatic JSON consumers (BioMapper/RoP) get no tier and no provenance — the headline deliverables. Two code paths = drift (CSV was updated for the evidence model, JSON wasn't). **Fix: make the server export endpoint the single source for all formats** (`?format=csv\|tsv\|json`) off the same `getCampaignExportData` rows, and have the client just download it. This also resolves the unsure-invisibility (#6) in JSON and the TSV request below. | med–high (data export loses core fields) | open — batch fix |
| 9 | §8 Export — TSV option (request) | **Add TSV as an export format** (user request). Trivial once exports are unified server-side: same csv-stringify serializer with `delimiter: "\t"`, `.tsv` filename, `text/tab-separated-values`. Do it as part of finding #8's server-side unification rather than adding a third client path. | low (enhancement) | open — batch fix |
| 10 | §3 Vote history — labels | **Vote-history badges use hardcoded evidence-tier words, not the campaign's configured vote labels.** `vote-history.tsx:61–74` hardcodes `match→"Confirmed"`, `unsure→"Unsure"`, `no_match→"Rejected"`. Two issues: (a) ignores configured labels (test4 = "Match/No Match/Unsure"), unlike the review screen; (b) "Confirmed/Rejected" are consensus-tier terms misapplied to a single vote. The edit dialog uses "Reject / Unsure / Confirm" — also hardcoded (never the configured "Match/No Match/Unsure"). Fix: render the campaign's configured binary labels in both the history badge and the edit buttons. Ties to #7 (ordering) and §2 (configured labels). | low–med (consistency/correctness) | open — batch fix |
| 11 | App-wide — stale lists | **List/detail views don't reflect recent changes without a manual refresh** (`staleTime: Infinity` + missing query invalidation after mutations/navigation). Observed (3×): vote-history didn't show the new state after navigating back (needed manual refresh); the review page needed a reload to pick up edited campaign config; and after activating a campaign + importing pairs, the review page showed no first pair until a manual refresh. Fix: invalidate the relevant queries after the mutations that change them (vote cast/edit, config save, archive) and/or set sensible `staleTime`/refetch-on-mount for these lists. (Distinct from #5, which is a wrong-URL bug, not staleness.) | low–med (UX/staleness) | open — batch fix |
| 12 | §6 Analytics — incomplete/broken | **Campaign Analytics is notably underbaked.** Overview tab: "votes over time" works, but **"View Details" (after selecting a campaign) does nothing**. Campaign-details tab: evidence-tier distribution **doesn't fill the x-axis width** (should be responsive); **no scoring-mode usage**; **no binary vote distribution**; **"Reviewers" and "Disagreements" buttons → blank pages**; **Skips stats render blank** (total skips / unique pairs skipped / skip rate) instead of showing `0`. Fix: wire up View Details + Reviewers + Disagreements; render zero-state numbers; add scoring-mode/vote-distribution panels; make the tier bar responsive. | med (broken nav + missing/blank panels) | open — batch fix |
| 13 | §1 Config editor — numeric defaults | **Numeric consensus threshold fields have no default values.** Creating a numeric campaign leaves `numericConfirmThreshold`/`numericRejectThreshold` empty, so the admin must guess. Binary has sensible defaults (confirmPct 70 / rejectPct 70); numeric should too (e.g. derive from range, or confirm = max−1, reject = min+1). (`CampaignConfigEditor.tsx` numeric consensus inputs) | low (UX) | open — batch fix |
| 14 | §4 Results — detail dialog metadata | **PairDetailDialog omits pair metadata.** The results detail popup shows source/target text+id and LLM info, but **not** `source_metadata`/`target_metadata` (kegg_id/pubchem_cid/curator_note etc.). Since preserving arbitrary metadata is the point of the generalization, an admin browsing results can't see it in the detail view (it only appears on the review screen's metadata panel). Fix: render the metadata badges in PairDetailDialog too. | low–med (gap) | open — batch fix |
| 15 | §2 Review — numeric slider | 🔴 **Numeric slider auto-submits the vote on the first drag tick.** The slider's `onValueChange` fires continuously during drag and is wired straight to the submit handler (`ScoringControls.tsx:156` → `onNumericSelect`), so the confirmation popup appears before the reviewer releases the mouse / picks their intended value — slider voting is effectively unusable. Buttons are fine (deliberate single click). Fix: slider should update a local selection via `onValueChange`, and cast the vote only on `onValueCommit` (mouse release) or via a separate **Submit** button. | med (slider voting unusable) | open — batch fix |
| 7 | App-wide — scoring order | **Inconsistent positive/negative/neutral ordering across the app.** Canonical order should be **negative → neutral → positive** (reject/unsure/accept), as the review buttons already render (`ScoringControls`: No Match · Unsure · Match). But the config editor's label inputs are ordered positive/negative/neutral (`CampaignConfigEditor.tsx:172–224`), and the PairDetailDialog vote summary reads positive/negative/unsure. Pick one order and apply to: config label inputs, results votes column (#6), and the detail-dialog vote summary. | low (UX/consistency) | open — batch fix |
| 5 | §1 Config editor — **data loss** | 🔴🔴 **Editing an existing campaign's config silently clobbers it back to defaults.** The Configure dialog loads the saved config via `useQuery(["/api/campaigns", campaign.id])` (`campaigns.tsx:438`), but the shared `getQueryFn` builds the URL from **`queryKey[0]` only** (`lib/queryClient.ts:32`) — so it fetches the **list** endpoint `/api/campaigns` (an array), not `/api/campaigns/:id`. `array.config` is `undefined` → `safeParse` fails → editor falls back to `DEFAULT_CAMPAIGN_CONFIG` **every time**. Confusing on open; **destructive on save** — any edit writes `defaults + your one change`, wiping all other settings. **Proven on dev 2026-05-29:** saving a minVotes change on test4 wiped its `showExternalLinks`/`linkTemplate` back to defaults. Fix options: (a) give this query an explicit `queryFn`/single-string key hitting `/api/campaigns/${id}`, or (b) make `getQueryFn` join path segments from the queryKey (riskier — other keys may carry non-URL segments). Likely affects **any** detail query keyed `[base, id]`. | **high (silent data loss)** | open — **priority fix** |

_(Pre-flight: dev DB was un-migrated at QA start — new code on old schema, API 500s. Ran the migration sequence on `expertloop_dev` to fix. Side effect: `db:push --force` dropped the legacy `session` table — harmless on dev/Clerk, but a PROD HAZARD for the Google-OAuth prod box; do not use `--force` there.)_

## Priority focus

The 🔴 items in **§1 (minVotes warning + recompute dialog), §3 (supersession + regression), §5 (unsure-in-denominator math), §8 (CSV injection), §9 (archived isolation)** are where ~80% of attention belongs — behaviors with real logic that a "looks done" UI can quietly get wrong.
