import { z } from "zod";

/**
 * Shared campaign-configuration contract used by both client and server.
 *
 * A campaign's behavior (scoring mode + labels, consensus thresholds, which
 * review-UI elements show, import filtering) is data, not code. This module is
 * the single source of truth for that shape and its validation.
 *
 * multi-criteria scoring is intentionally NOT here yet — deferred to
 * trentleslie/expert-in-the-loop#5. The schema is written so a third scoring
 * mode is additive (extend the discriminated union) rather than a restructure.
 */

// --- Evidence status (stored on pairs) -------------------------------------
export const EVIDENCE_STATUS_VALUES = [
  "unreviewed",
  "in_review",
  "expert_confirmed",
  "expert_rejected",
  "disputed",
] as const;
export const evidenceStatusSchema = z.enum(EVIDENCE_STATUS_VALUES);
export type EvidenceStatus = (typeof EVIDENCE_STATUS_VALUES)[number];

// --- Resolution layer (provenance, stored on pairs) ------------------------
export const RESOLUTION_LAYER_VALUES = [
  "authoritative_xref",
  "ai_assisted",
  "manual",
  "unspecified",
] as const;
export const resolutionLayerSchema = z.enum(RESOLUTION_LAYER_VALUES);
export type ResolutionLayer = (typeof RESOLUTION_LAYER_VALUES)[number];

// --- Bulk-recompute status (stored on campaigns) ---------------------------
export const RECOMPUTE_STATUS_VALUES = ["idle", "running", "done", "failed"] as const;
export const recomputeStatusSchema = z.enum(RECOMPUTE_STATUS_VALUES);
export type RecomputeStatus = (typeof RECOMPUTE_STATUS_VALUES)[number];

// --- Campaign config -------------------------------------------------------
const labelSchema = z.string().min(1).max(80);

// linkTemplate is admin-authored and rendered as an external link in the review
// UI. Constrain it to https:// (reject javascript:/data:/relative — XSS/redirect)
// and require the {targetId} placeholder so the rendered link is meaningful.
const linkTemplateSchema = z
  .string()
  .max(2048)
  .refine((s) => /^https:\/\//i.test(s), {
    message: "linkTemplate must start with https://",
  })
  .refine((s) => s.includes("{targetId}"), {
    message: "linkTemplate must contain the {targetId} placeholder",
  });

const binaryScoringSchema = z.object({
  mode: z.literal("binary"),
  binary: z.object({
    labels: z.object({
      positive: labelSchema,
      negative: labelSchema,
      neutral: labelSchema,
    }),
  }),
});

const numericScoringSchema = z.object({
  mode: z.literal("numeric"),
  numeric: z
    .object({
      min: z.number().int(),
      max: z.number().int(),
      labels: z.record(z.string(), labelSchema).optional(),
    })
    .refine((n) => n.min < n.max, {
      message: "numeric.min must be less than numeric.max",
    }),
});

// Exclusion scoring: the reviewer flags a pair's member variables (source_metadata.members) that do
// NOT belong to the concept, instead of casting one score. Each vote records the flagged member ids;
// consensus reduces to the binary "is this ONE concept?" (nothing flagged ⇒ coherent ⇒ confirmed; any
// member flagged ⇒ an over-merge ⇒ rejected), so it reuses `consensus.confirmPct` / `rejectPct` — no
// extra thresholds and no config knobs. Which members were flagged is retained as the rich payload.
const exclusionScoringSchema = z.object({
  mode: z.literal("exclusion"),
});

const campaignConfigBaseSchema = z.object({
  scoring: z.discriminatedUnion("mode", [binaryScoringSchema, numericScoringSchema, exclusionScoringSchema]),
  consensus: z.object({
    minVotes: z.number().int().min(1).default(2),
    confirmPct: z.number().min(0).max(100).default(70),
    rejectPct: z.number().min(0).max(100).default(70),
    // Required when scoring.mode === "numeric" — enforced by the top-level
    // refinement below (where scoring.mode is in scope).
    numericConfirmThreshold: z.number().optional(),
    numericRejectThreshold: z.number().optional(),
  }),
  display: z.object({
    showExternalLinks: z.boolean().default(false),
    linkTemplate: linkTemplateSchema.optional(),
    showAlternatives: z.boolean().default(false),
    showMetadataPanel: z.boolean().default(true),
  }),
  import: z.object({
    sourcePrefixFilter: z.boolean().default(false),
    sourcePrefixes: z.array(z.string().max(64)).max(50).optional(),
  }),
});

/**
 * Numeric campaigns MUST supply both numeric thresholds, and confirm must be
 * strictly greater than reject. Validated at the top level (not on `consensus`)
 * because both `scoring.mode` and `consensus` must be in scope:
 *  - Missing thresholds on a numeric campaign would route every pair through the
 *    engine's observable fallback, leaving everything stuck at `in_review`.
 *  - Inverted thresholds make `disputed` unreachable (confirm check runs first).
 */
export const campaignConfigSchema = campaignConfigBaseSchema.superRefine((cfg, ctx) => {
  if (cfg.scoring.mode !== "numeric") return;
  const { numericConfirmThreshold, numericRejectThreshold } = cfg.consensus;
  if (numericConfirmThreshold == null || numericRejectThreshold == null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "numeric scoring requires numericConfirmThreshold and numericRejectThreshold",
      path: ["consensus", "numericConfirmThreshold"],
    });
  } else if (numericConfirmThreshold <= numericRejectThreshold) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "numericConfirmThreshold must be greater than numericRejectThreshold",
      path: ["consensus", "numericConfirmThreshold"],
    });
  }
});

export type CampaignConfig = z.infer<typeof campaignConfigSchema>;

/**
 * Sensible default numeric consensus thresholds derived from the score range,
 * used to pre-fill the config editor when a campaign switches to numeric mode.
 * Guarantees the schema invariant `reject < confirm`, both within [min, max].
 */
export function defaultNumericThresholds(
  min: number,
  max: number,
): { numericConfirmThreshold: number; numericRejectThreshold: number } {
  const span = Math.max(0, max - min);
  const reject = Math.round(min + span * 0.3);
  let confirm = Math.round(min + span * 0.7);
  if (confirm <= reject) confirm = Math.min(max, reject + 1);
  return { numericConfirmThreshold: confirm, numericRejectThreshold: reject };
}

/**
 * Conservative default applied to new campaigns. minVotes:2 keeps a single
 * unanimous vote from auto-confirming a pair; 70/70 requires broad agreement.
 * Both are per-campaign tunable. Complete object so getCampaignConfig's
 * NULL-fallback is fully populated.
 */
export const DEFAULT_CAMPAIGN_CONFIG: CampaignConfig = {
  scoring: {
    mode: "binary",
    binary: { labels: { positive: "Match", negative: "No Match", neutral: "Unsure" } },
  },
  consensus: { minVotes: 2, confirmPct: 70, rejectPct: 70 },
  display: { showExternalLinks: false, showAlternatives: false, showMetadataPanel: true },
  import: { sourcePrefixFilter: false },
};
