---
title: "Backlog: Campaign creation / config-editor UX follow-ups"
type: notes
date: 2026-05-29
status: backlog
origin: QA of PR #7 (campaign model generalization) on dev
intended_branch: feat/campaign-config-ux (future, after PR #7 QA lands)
---

# Campaign config UX follow-ups

Captured during dev QA of the campaign-model generalization. These are **UX
polish ideas for a future feature branch** — not blockers for PR #7. The config
editor itself landed well ("configure scoring & display dropdown is amazing");
these notes are about making it more self-explanatory since an admin sets these
up infrequently and shouldn't have to remember what each knob means.

## 0. Priority bugs (from dev QA 2026-05-29) — fix before/with the UX polish

These are correctness bugs surfaced during PR #7 QA (full detail + repro in
`docs/qa/2026-05-29-generalization-ui-qa-checklist.md`, findings table — **15
findings** total). They belong on this feature branch and outrank the UX items
below. Severity-ranked highlights (see the table for the rest):

- **#5 (high)** config-edit silently clobbers config to defaults — *priority*
- **#8 (med-high)** JSON export drops evidence_status/resolution_layer/unsure/notes (unify exports server-side; also adds TSV #9)
- **#12 (med)** Campaign Analytics broken/incomplete (View Details no-op, Reviewers/Disagreements blank pages, blank skip stats, non-responsive tier bar)
- **#15 (med)** numeric slider auto-submits on drag (use onValueCommit / submit button)
- Plus lower-severity: #2 source-link, #3 dup-confidence, #4 chevron, #6 unsure-invisible, #7/#10 label+order consistency, #11 stale lists (3×), #13 numeric threshold defaults, #14 detail-dialog metadata, #1 minVotes warning, #9 TSV.

1. **🔴🔴 PRIORITY — Editing a campaign's config silently clobbers it to defaults.**
   The Configure dialog's `useQuery(["/api/campaigns", campaign.id])` hits the
   shared `getQueryFn`, which builds the URL from `queryKey[0]` only
   (`client/src/lib/queryClient.ts:32`) → fetches the **list** endpoint, gets an
   array, `array.config` is undefined → editor falls back to defaults every time.
   On save it writes `defaults + your one change`, wiping all other settings
   (proven: a minVotes edit wiped test4's external-link config). Fix: explicit
   `queryFn`/single-string key for `/api/campaigns/${id}`. **Audit all other
   `[base, id]` detail queries** — same latent bug anywhere this pattern is used.
2. **Review: source ID linkified with the target-namespaced template** — source
   IDs render as `https://hmdb.ca/<sourceId>` (bogus). Link only the target, or
   add a separate source template. (`client/src/pages/review.tsx:193–197`)
3. **Review: duplicate LLM confidence defeats the bias warning** — confidence
   shows always-visible (`review.tsx:777–781`) *and* inside the collapsible
   reasoning panel. Remove the always-visible copy. (med — undermines anti-anchoring)
4. **App-wide: inconsistent disclosure-chevron convention** — config editor
   (right→down) vs review accordion (down→up). Pick one. (nitpick)
5. **minVotes advisory warning still unimplemented** (see §4 below — warn at ≥2).

## 1. Campaign type → proper dropdown + curated options

- **Make campaign type a dropdown** (currently a free-text combobox / `CampaignTypeCombobox` backed by the now-free-text `campaigns.campaignType`).
- **Audit the current type options and consolidate** — can some be merged? Candidates seen across the codebase/brainstorm: `questionnaire_match`, `loinc_mapping` (legacy), `match_validation`, `classification_review`, `recommendation_quality`, plus the brainstorm's "CDE quality review" / "metabolite mapping" scenarios. Decide the canonical short list.
- **Add a one-line description per type** so the admin knows what each is for (shown in the dropdown or as helper text under the field).
- Open question: is "campaign type" now mostly cosmetic/labeling (since `pairType` is free-text and scoring is config-driven)? If so, the dropdown is purely about presets/labeling — clarify its role, or consider whether type should *seed a default config* (ties into templates, deferred issue #6).

## 2. Inline descriptions for each config-editor section

The "Configure scoring & display" disclosure has five sections; each should get
a **short inline description** (helper text under the section header) so an
infrequent user understands the knob without leaving the page:

- **Scoring Mode** — e.g. "How reviewers score each pair: a yes/no/unsure choice (binary) or a numeric scale."
- **Scoring Labels** — e.g. "The button/scale text reviewers see. Customize per campaign."
- **Display Options** — e.g. "Which panels appear on the review screen: external links, alternatives, metadata."
- **Consensus Thresholds** — e.g. "How much agreement + how many votes decide a pair's evidence tier (confirmed / rejected / disputed). minVotes ≥ 2 needs that many distinct reviewers per pair."
- **Import Options** — e.g. "Optional filtering applied when importing pairs (e.g. drop same-source pairs)."

(Final copy TBD — keep it to one short sentence each; tooltips or muted helper
text, not paragraphs.)

## 3. Config editor hidden behind a collapsed disclosure

On the create-campaign dialog the whole `CampaignConfigEditor` is nested inside a
second disclosure (`Configure scoring & display`) that defaults to **collapsed**
(`configOpen = useState(false)`, `campaigns.tsx:149`). Result: a first-time admin
sees only the basic fields (name / type / instructions) and has to discover the
disclosure to reach scoring/display/consensus/import at all.

- **Default the disclosure to open on *create*** so the five sections are visible
  without a click. (On *edit*, collapsed-by-default may still be fine — revisit.)
- **Couple this with §2 (inline section descriptions)** — defaulting open exposes
  all five sections immediately, so the short helper text per section is a
  prerequisite, not a separate nicety. Ship them together.
- Once open, the intended in-editor layout already works: Scoring Mode + Display
  expanded, Consensus + Import collapsed (`CampaignConfigEditor.tsx`).
- Note the QA-checklist wording "CampaignConfigEditor appears below the basic
  fields" is misleading given the disclosure — reconcile checklist vs. behavior.

## 4. minVotes advisory warning (direction matters)

Carried over from the QA findings table (PR #7, finding #1 — still open). The
helper warning under the `minVotes` field is not implemented yet. Key detail so
we build it the right way round:

- The footgun is the **default `minVotes: 2`** (`campaignConfig.ts:143`), which
  silently requires 2+ *distinct* reviewers per pair or pairs sit stuck in
  `in_review`. So the warning fires when **`minVotes >= 2`**, NOT at 1.
- `minVotes: 1` is the single-reviewer-safe value → no warning.
- Fix: conditional muted helper text under the minVotes field when value ≥ 2,
  e.g. "Pairs need this many distinct reviewers before consensus is computed;
  with fewer active reviewers they'll stay in review." Ties into the §2 Consensus
  inline description above.

## 5. Access model: default-admin + role-tailored navigation (UX, not security)

Surfaced during dev QA when campaign creation 403'd. **Decision:** the
reviewer/admin split is a *UX streamlining* concern, not a security boundary —
the `*@phenomehealth.org` Clerk allowlist is the real trust boundary; everyone
who can log in is trusted staff. The point is to keep reviewers in a focused
review experience, not to stop them from doing admin things.

**Root cause of the QA block (confirmed):** `requireAdmin` (`server/auth.ts:70`)
reads `role` from a Clerk **session-token claim** (`auth.sessionClaims.role`).
The claim mapping `role → public_metadata.role` IS configured (proven: after
setting role + re-login, create returned 201). The actual gaps were just (a) the
QA user's `public_metadata` was empty (no role ever assigned), and (b) the
existing browser token was stale (minted before the role was set), so a fresh
sign-in was required. Fix applied during QA: `public_metadata.role = "admin"`
via `npx clerk api` + re-login.

The deeper concern for the feature branch is the *onboarding* gap, not the claim
plumbing: a brand-new user has no role, so they hit 403s until someone manually
assigns one. That's the friction the default-admin / role-tailored-nav work
should remove — new users should degrade gracefully, never 403.

**Design direction for the feature branch:**

- **Don't rely on the Clerk session-token claim as the only source of role.**
  Either configure it properly *or* read role from the DB user record
  (`/api/auth/me` already does find-or-create) so the app isn't broken by a
  missing Clerk customization. Decide one source of truth.
- **Default new users to a sane role** so onboarding isn't blocked (likely
  `reviewer` for streamlined default, with admins promoted) — but since access
  isn't a hard gate, a missing/unknown role should degrade gracefully, not 403.
- **Reorganize the nav into Reviewer vs Admin sections.** Reviewers see the
  review flow (+ their own vote history); admins additionally see campaign
  management (campaigns, upload, results, analytics, config editor). Role drives
  *which sections show by default / landing page*, not server-side permission.
- **Open question:** do we keep `requireAdmin` at all? Options ranged from fully
  flat (drop it) to gating only destructive/exfil actions (export, delete,
  archive) to keeping two real roles. User leaning: not about prevention, about
  not overwhelming reviewers — so the lightest server-side enforcement that
  still lets us tailor the UI by role. Resolve when planning this branch.

## 6. Import wizard: Pair Type required-vs-optional + Pair Type / Resolution Layer clarity

Surfaced during dev QA of the import column-mapping wizard (`admin/upload`).

**6a. Pair Type is wrongly required (client/server mismatch).** The wizard lists
`pairType` in `REQUIRED_FIELDS` (`client/src/components/ColumnMapper.tsx:324,332`),
so import is blocked until it's mapped or given a fixed value. But the server
treats pair type as **optional**, defaulting unmapped rows to the campaign's type
(`server/routes.ts:196`, `:293`; same fallback in `upload.tsx:163`). Fix: move
`pairType` from `REQUIRED_FIELDS` to `OPTIONAL_FIELDS` so unmapped → inherits
campaign type, matching the generalized free-text model. (Workaround during QA:
use the wizard's "enter a fixed value" option, e.g. `match_validation`.)

**6b. Pair Type vs Resolution Layer are easily confused.** They're two different
axes and the wizard doesn't make it clear:
- **Pair Type** = classification of *what kind of comparison* this is (free-text,
  defaults to campaign type). Current description "Classification type for this
  pair" (`ColumnMapper.tsx:130`) is too thin.
- **Resolution Layer** = *provenance of how the pair was produced*
  (`authoritative_xref` / `ai_assisted` / `manual` / `unspecified`; defaults to
  `unspecified`).
Fix: sharpen both field descriptions to state the axis + the default, e.g.
Pair Type → "What kind of comparison this is — defaults to the campaign type
(e.g. match_validation) if unmapped"; Resolution Layer → "How this pair was
produced; defaults to unspecified if unmapped." Ties into §2 (self-describing
fields) — same "infrequent admin shouldn't have to guess" principle.

## Why this matters
Admins configure campaigns rarely, so the editor is exactly the place where
"what does this do?" friction shows up. Self-describing fields reduce setup
errors (e.g. the minVotes footgun) without docs lookups.

## Related
- PR #7 — campaign model generalization (the editor this builds on)
- Deferred issue #6 — campaign templates (type→default-config seeding overlaps here)
- `client/src/components/CampaignConfigEditor.tsx`, `client/src/pages/admin/campaigns.tsx` (`CampaignTypeCombobox`)
