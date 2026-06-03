# RoP Design Principles — Reference for Expert in the Loop

## What is RoP?

[RoP (Reference of Parameters)](https://huggingface.co/datasets/DataTecnica/RoP_biomedical) is DataTecnica's open dataset of 1.33M harmonized Common Data Elements across 9+ biomedical vocabulary standards. It ships with SapBERT embeddings and a FAISS index for semantic matching, with quarterly releases.

- **Source code**: https://github.com/datatecnica/RoP_biomedical
- **Authors**: Pietro Marini, Alan Long, Hirotaka Iwaki, Mike Nalls, Dan Vitale (DataTecnica)
- **License**: CC-BY-NC-4.0 (data), AGPL-3.0 (code)

RoP's curation platform ("The Forge") is essentially an expert-in-the-loop system for CDE harmonization. The design principles below are worth adopting or adapting in EITL.

> **Sourcing note**: RoP has no published paper as of 2026-05-28 (repo created 2026-05-13). The "principles" framing below is our synthesis, not DataTecnica's language. Each principle is derived from specific RoP sources cited inline. The EITL analogues and layered architecture framing are our interpretation.

## Principle 1: Categorical Evidence Tiers, Not Just Confidence Scores

RoP tracks `curation_status` as a categorical statement about *how* an equivalence was established, not just a numeric confidence:

| Status | Meaning | EITL Analogue |
|---|---|---|
| `auto-matched` | Algorithm suggested, no human review | AI suggestion awaiting review |
| `HitL-confirmed` | Human reviewed and approved an auto-match | Expert confirmed an AI suggestion |
| `expert-curated` | Human created the mapping from scratch | Expert originated the mapping |
| `under-review` | Flagged for re-evaluation | Disputed or uncertain |
| `deprecated` | Superseded, points to replacement via `replaced_by_rop_id` | Retired mapping with provenance trail |

**Source**: `curation_status` field and allowed values defined in [`docs/SPEC.md`](https://github.com/datatecnica/RoP_biomedical/blob/main/docs/SPEC.md) under "Governance State" schema group.

**Why this matters**: A confidence score of 0.92 tells you nothing about whether a human has looked at it. Evidence tiers separate "how sure is the algorithm" from "has a domain expert validated this." EITL should track both dimensions independently.

## Principle 2: Non-Transitive Equivalence

RoP's strongest design decision: equivalence is **not transitive by default**.

If an expert confirms A ≡ B and a different expert confirms B ≡ C, the system does **not** automatically assert A ≡ C. That chain requires its own explicit review.

**Source**: [`docs/SPEC.md`](https://github.com/datatecnica/RoP_biomedical/blob/main/docs/SPEC.md) under "Equivalence & Matching Methodology" — states: *"Equivalence is not transitive by default. Chains A ≡ B ≡ C require curator review before asserting A ≡ C, preventing cascading false positives from low-confidence automated matches."*

**Why this matters**: Transitivity is the main vector for cascading false positives in entity resolution. One bad link in a chain pollutes every downstream equivalence. Forcing explicit review at each hop is expensive but prevents the "expert-confirmed" label from becoming meaningless through chaining.

**Implementation consideration**: EITL should flag transitive chains for review rather than auto-propagating them. Present the chain to the expert: "A ≡ B (confirmed by Expert 1) and B ≡ C (confirmed by Expert 2) — should A ≡ C?"

## Principle 3: Authoritative xref Harvesting as a Distinct Layer

RoP's equivalence pipeline does not use algorithmic matching (no embeddings, no string similarity, no scoring). It exclusively harvests explicit cross-references from authoritative sources:

- **HPO** OBO `xref:` lines (e.g., `xref: OMIM:154700`)
- **Mondo** standardized xrefs (OMIM, ICD-10, MeSH, Orphanet)
- **NINDS-CDE** prefixed identifiers (LOINC, SNOMED, caDSR)
- **OMOP/Athena** CONCEPT_RELATIONSHIP "Maps to" edges

This means their equivalence assertions are backed by the vocabulary maintainers themselves — not computed similarity.

**Source**: [`rop/equivalence.py`](https://github.com/datatecnica/RoP_biomedical/blob/main/rop/equivalence.py) — the module contains no scoring algorithms or thresholds; it parses xref tokens from source authority files and generates `EquivalenceEdge` records with provenance tags. Also documented in [`docs/SPEC.md`](https://github.com/datatecnica/RoP_biomedical/blob/main/docs/SPEC.md) under "Assertion Criteria."

**Why this matters for EITL**: This suggests a layered resolution architecture:

```
Layer 1: Authoritative xrefs     → high confidence, limited coverage (RoP approach)
Layer 2: AI-assisted resolution   → variable confidence, broad coverage (BioMapper approach)
Layer 3: Expert validation        → high confidence, broad coverage (EITL's role)
```

EITL should present Layer 1 matches differently from Layer 2 matches. An authoritative xref that HPO curators published is a fundamentally different kind of evidence than an embedding similarity score of 0.89. The expert reviewing in EITL should see which layer produced each candidate.

## Principle 4: Governance at Ingest Time

RoP's Forge platform blocks non-compliant data before it enters the pipeline. Validation isn't a post-hoc quality check — it's an ingest gate.

Their conformance levels (1-6 + S + D) define what data must satisfy before it can participate in cross-cohort analysis:

| Level | Requirement |
|---|---|
| 1 | Required columns + identity tier |
| 2 | + Time tier (convertible dates) |
| 3 | + Sex tier (no conflation of chromosomal/assigned/identity) |
| 4 | + Ancestry tier (with method companions) |
| 5 | + Biosample lineage |
| 6 | + Omics platform metadata |
| S | + Governance/consent (sharing-ready) |
| D | + Data asset references (asset-linked) |

**Source**: Conformance levels defined in [`docs/SPEC.md`](https://github.com/datatecnica/RoP_biomedical/blob/main/docs/SPEC.md) under "Conformance Levels." The Forge's ingest-time blocking behavior described on the [HuggingFace dataset card](https://huggingface.co/datasets/DataTecnica/RoP_biomedical).

**Why this matters for EITL**: Expert validation could include conformance-level assessment. When an expert reviews a mapping, they could also attest to the data quality level, creating a dual signal: "this mapping is correct AND the underlying data meets Level N conformance."

## Principle 5: Deprecation with Provenance

When a mapping is superseded, RoP doesn't delete it. The old accession stays with `is_active=false` and a `replaced_by_rop_id` pointer. Published harmonizations always resolve — they just redirect.

**Source**: [`docs/SPEC.md`](https://github.com/datatecnica/RoP_biomedical/blob/main/docs/SPEC.md) under "Versioning & Stability Policy" — states: *"rop_accession values are never recycled. Retired concepts retain their accession with is_active=false and optional replaced_by_rop_id pointer, ensuring published harmonizations always resolve."*

**Why this matters for EITL**: Expert decisions should never silently disappear. If a mapping is later found incorrect, record who deprecated it, why, and what replaced it. This creates an audit trail and lets downstream consumers understand why their previously-valid mapping changed.

## Principle 6: Content Hashing for Change Detection

RoP computes SHA-256 over canonicalized content fields (description, item_type, values, source_authority, source_code, alternate_names, etc.) and explicitly excludes audit timestamps, governance state, and derived fields.

**Source**: [`docs/SPEC.md`](https://github.com/datatecnica/RoP_biomedical/blob/main/docs/SPEC.md) under "Content Hashing & Change Detection" — specifies the exact fields included/excluded from hash computation.

This enables:
- Embedding rebuild only on actual content change (not metadata updates)
- Delta detection between bundle versions
- Idempotent re-ingest from upstream sources

**Why this matters for EITL**: When upstream data changes, EITL needs to know whether a previously-validated mapping should be re-reviewed. Content hashing distinguishes "the entity definition changed" (re-review needed) from "the metadata was updated" (no action needed).

## Integration Context

RoP is also being evaluated as a "first-pass" layer for BioMapper — providing high-confidence authoritative mappings before BioMapper's AI-assisted resolution handles the gaps. RoP covers the clinical/observational vocabulary space (OMOP, LOINC, HPO, Mondo, PhenX, NINDS-CDE) while BioMapper covers the molecular/biological space (HMDB, UniProt, KEGG, ChEBI, SPOKE, RTX-KG2).

For self-reported data harmonization (BioMapper issue #52), RoP resolves the CDE layer ("what variable is this?") while BioMapper resolves the entity layer ("what biological entity does this variable reference?").

---

*Added 2026-05-28 from morning research session. See also: [RoP HuggingFace dataset](https://huggingface.co/datasets/DataTecnica/RoP_biomedical), [RoP GitHub](https://github.com/datatecnica/RoP_biomedical).*
