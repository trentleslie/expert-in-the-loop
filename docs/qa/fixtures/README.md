---
title: "QA import fixtures"
type: qa-fixture
date: 2026-05-29
---

# QA import fixtures

Reusable CSVs for exercising the import wizard and the downstream review /
results / export checks. Metabolite-mapping flavored so the external-link tests
(`https://hmdb.ca/{targetId}`) are realistic.

## `qa-metabolite-pairs.csv`

14 source→target metabolite pairs. Column names are deliberately a **mix** of
canonical and renamed so the mapping wizard (admin/upload → "Map Columns") is
actually tested rather than auto-passing.

### Column → field mapping

| CSV column | Map to | Notes |
|---|---|---|
| `source_text` | Source text | canonical name (should auto-suggest) |
| `source_dataset` | Source dataset | canonical |
| `source_id` | Source ID | canonical, `SRC001`..`SRC014` |
| `target_name` | Target text | **renamed** — must map by hand |
| `target_db` | Target dataset | **renamed** |
| `hmdb_id` | Target ID | **renamed**; feeds the `{targetId}` link template |
| `match_provenance` | Resolution layer (optional) | **renamed**; values are valid enum members |
| `confidence_score` | LLM confidence | numeric 0–1 |
| `model` | LLM model | **renamed** |
| `reasoning` | LLM reasoning | also carries an XSS/injection payload (row 9, 10) |
| `kegg_id` | *(leave unmapped)* → target metadata | extra column, must survive into metadata |
| `pubchem_cid` | *(leave unmapped)* → source metadata | extra column |
| `curator_note` | *(leave unmapped)* → metadata | extra column; carries CSV-injection payload |

Required fields the server enforces: source_text, source_id, target_text,
target_id. Everything else is optional.

### What specific rows exercise

- **§7 arbitrary columns → metadata:** `kegg_id`, `pubchem_cid`, `curator_note`
  are extra columns. Leave them unmapped (or assign to source/target metadata) and
  confirm they land in the pair's metadata, nothing dropped, no LOINC fallback.
- **§7 resolution_layer default:** on a **first** import, **leave
  `match_provenance` unmapped** → every pair should default to `unspecified`. Do a
  **second** import mapping it → values (`authoritative_xref` / `ai_assisted` /
  `manual` / blank→`unspecified`) should persist. Note rows 2/11/12 are blank.
- **§2 configured labels / voting variety:** row 5 (α-Ketoglutarate) is a good
  "unsure"; rows 7 and 14 are good "no match" (low confidence, obvious mismatch);
  the rest are confident matches — enough spread for the §5 consensus checks.
- **§2 external links + encoding:** set the campaign `linkTemplate` to
  `https://hmdb.ca/{targetId}` to test link *rendering + encoding*. **Row 11**'s
  `hmdb_id` = `HMDB0000999 (provisional)` (space + parens) verifies the ID is
  **URL-encoded** in the href. Note: a raw HMDB accession isn't hmdb.ca's real
  URL path — to get a link that actually *resolves*, use
  `https://hmdb.ca/metabolites/{targetId}`. (Whether the target ID is URL-ready
  is an input/curation concern, not a UI bug — the template substitutes whatever
  ID it's given.)
- **§10 XSS:** row 10 puts `<img src=x onerror=alert(1)>` in `reasoning` and
  `<script>alert('xss')</script>` in `curator_note`. Must render as **literal
  text** everywhere (review, results, detail dialog) — never execute.
- **§8 CSV injection (on export):** row 9 has `reasoning=@SUM(A1:A9)` and
  `curator_note==1+1`. Imported verbatim; the **export** must neutralize leading
  `= + - @` (prefix a `'`) so they can't execute in a spreadsheet.
- **Unicode:** rows 4/5 (`β-Alanine`, `α-Ketoglutaric acid`) confirm non-ASCII
  round-trips through import → render → export.
- **CSV quoting:** row 12 has embedded commas and escaped `""` quotes in
  `reasoning`/`curator_note` to confirm the parser handles RFC-4180 quoting.

### Campaign setup to pair with this file

- **Binary campaign** (default scoring): custom labels e.g. `Match` /
  `No Match` / `Anybody's Guess`; `linkTemplate = https://hmdb.ca/{targetId}`,
  `showExternalLinks = on`, `showMetadataPanel = on`. Covers §2/§5/§8/§10.
- **Numeric campaign** (same CSV): set scoring numeric **1–50** to verify the
  review screen renders a **slider** (not a button wall); a 1–5 numeric verifies
  the button row. Scoring mode is campaign-level, so the same data works for both.

### Negative test (do by hand, don't commit a broken file)

To verify the server rejects bad provenance: edit one row's `match_provenance` to
an invalid value (e.g. `made_up_layer`), map the column, and import → expect a
**400** listing the allowed values, with **nothing inserted** (all-or-nothing).
