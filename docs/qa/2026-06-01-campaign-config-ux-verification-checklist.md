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

- [ ] 🔴 **[#5] No more config clobber (the headline).** Take a campaign with **non-default** config (custom labels + external links ON + `linkTemplate` + minVotes 1). Open **Configure** → the editor shows the **saved** values, not defaults. Change **one** field → Save → reopen: only that field changed, everything else persisted. *(This is the data-loss fix — verify carefully, ideally cross-check the DB.)*
- [ ] **Open-by-default + descriptions.** Create a campaign → "Configure scoring & display" is **expanded**, with a one-line description under each section.
- [ ] **[#1] minVotes warning.** `minVotes ≥ 2` shows the "needs N distinct reviewers / pairs stay in review" helper; `minVotes 1` shows nothing.
- [ ] **[#13] Numeric threshold defaults.** Switch scoring to **numeric** → confirm/reject thresholds are pre-filled (reject < confirm, within range), not empty.
- [ ] **[#4] Chevrons** read collapsed = down, expanded = up (same as the review accordion).

## 2. Review flow (`review.tsx`)

- [ ] 🔴 **[#15] Slider commits on release.** Numeric campaign (range >10) → **slider**. **Dragging does NOT open the confirm dialog**; the dialog appears once when you release on a value.
- [ ] **[#2] Target-only external link.** With `showExternalLinks` + `linkTemplate`, only the **target** ID is a link; the **source** ID is plain text (no bogus `hmdb.ca/<sourceId>`).
- [ ] **[#3] No duplicate confidence.** LLM confidence appears **only** inside the expanded "LLM Reasoning" panel — not always-visible below it.
- [ ] Vote buttons show the campaign's **configured labels**.

## 3. Vote history (`vote-history.tsx`)

- [ ] **[#10] Configured vote labels.** Badges + edit-dialog buttons show the campaign's labels (e.g. `Match / No Match / Unsure`), **not** "Confirmed / Rejected / Unsure".
- [ ] **(follow-up) Numeric edit uses config.** Edit a **numeric** vote → the score control reflects the campaign's **actual range + labels** (slider for large range), **not** a hardcoded 1–5 with "1 = Unrelated, 5 = Exact match".
- [ ] **[#11] No stale-after-navigate.** Edit a vote → navigate away and back → vote history reflects the change **without a manual refresh**.

## 4. Results browser (`admin/results`)

- [ ] **[#6] Three-count votes column (binary).** Binary campaign: votes column shows **reject / unsure / accept**; a disputed-by-unsure pair reads **`0 / 1 / 0`**, not `0/0`.
- [ ] **(Greptile follow-up) Numeric votes column.** Numeric campaign: the votes column shows the **plain vote count** (e.g. `5`), **not** `0 / N / 0` (every vote mislabeled unsure).
- [ ] **[#14] Detail-dialog metadata.** Open a pair → the dialog renders source/target **metadata badges** (`kegg_id` / `pubchem_cid` / `curator_note`).
- [ ] 🔴 **[#10/§10] XSS inert.** Open SRC010 → `<img src=x onerror=alert(1)>` (reasoning) and `<script>…</script>` (curator_note) render as **literal text**; no alert, no broken image.
- [ ] **[#4] Empty-filter state.** Filter to a zero-count tier → "No pairs with status…" + Clear.

## 5. Export (`admin/results` → Export)

- [ ] 🔴 **[#8] JSON complete + envelope.** Export **JSON** → top-level `{campaign, exportedAt, total, pairs:[…]}`, and each pair carries `evidence_status`, `resolution_layer`, `unsure_votes`, `reviewer_notes`.
- [ ] **[#9] TSV.** TSV is a format option; downloads tab-delimited and opens cleanly.
- [ ] **Whole-campaign scope.** Apply an on-screen filter, then export → the file still contains the **whole** campaign (all formats).
- [ ] 🔴 **CSV/TSV injection neutralized.** A reviewer note `=1+1` exports as `'=1+1`.
- [ ] **(Greptile fix) Numeric export coherence.** Export a **numeric** campaign → `positive_rate` is **empty** (N/A, not `0.000`), binary counts are `0`, and **`mean_score`** holds the mean of scores.
- [ ] **Allowlist + auth.** `?format=xml` → 400; a non-admin request to `?format=json`/`tsv` → 403.

## 6. Analytics (Campaign Analytics)

- [ ] 🔴 **[#12] Sections render (was the queryFn footgun).** Select a campaign with votes → **Vote distribution, Reviewers, Disagreements, Skips** tabs all show their data — **none blank**.
- [ ] **View Details** navigates to the campaign tab (no longer a no-op).
- [ ] Skip stats show **`0`** (not blank) for a zero-skip campaign; tier bar fills the card width.

## 7. Stale-list freshness + archived isolation

- [ ] **[#11] Import → review.** Activate a campaign, import pairs, open review → the **first pair is served without a manual refresh**.
- [ ] **[#11] Vote → progress.** Cast a vote → Home progress + results reflect the new tier without refresh.
- [ ] 🔴 **(carry-over) Archived isolation.** Editing a vote on an **archived** campaign → server **403** ("Campaign is not open for voting"); archived campaigns aren't offered for voting.

## 8. Carried-over / never-verified (best-effort)

- [ ] `showAlternatives` toggle actually shows/hides the alternatives panel on review.
- [ ] **Raw CSV upload path** (non-wizard) auto-dumps non-standard columns into metadata.
- [ ] PairDetailDialog vote-table **"Vote" column** shows the actual choice (Match/Unsure), not the scoring **mode** ("binary") — *minor, was noted in #10 but not fixed.*

---

## Verification log — dev run 2026-06-__

| # | Section | Result | Status |
|---|---------|--------|--------|
| | | | |

_Mark each item ✅/❌ as you go. Any ❌ becomes a new finding row here — same convention as the predecessor checklist. The fixture and its README live in `docs/qa/fixtures/`; remember to upload the **repo** CSV, never a Slack copy (rich-text strips the `<img>` payload)._
