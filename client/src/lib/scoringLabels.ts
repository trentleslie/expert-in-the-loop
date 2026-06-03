import type { CampaignConfig } from "@shared/campaignConfig";

/**
 * Single source of truth for turning a stored vote into a human label, derived
 * from the campaign's scoring config. Vote-history and the results detail dialog
 * previously hardcoded "Confirmed/Rejected/Unsure" — borrowing evidence-TIER
 * words for an individual vote and ignoring the campaign's configured labels.
 */

export type BinaryChoice = "match" | "no_match" | "unsure";

type Scoring = CampaignConfig["scoring"];

const GENERIC_BINARY: Record<BinaryChoice, string> = {
  match: "Match",
  no_match: "No Match",
  unsure: "Unsure",
};

/** Configured label for a binary vote choice (falls back to generic vote words). */
export function binaryVoteLabel(scoring: Scoring | undefined, choice: BinaryChoice): string {
  if (scoring?.mode === "binary") {
    const { labels } = scoring.binary;
    if (choice === "match") return labels.positive;
    if (choice === "no_match") return labels.negative;
    return labels.neutral;
  }
  return GENERIC_BINARY[choice];
}

/** Label for a numeric vote: configured per-value label, else the raw score. */
export function numericVoteLabel(scoring: Scoring | undefined, score: number): string {
  if (scoring?.mode === "numeric") {
    const label = scoring.numeric.labels?.[String(score)];
    if (label) return label;
  }
  return String(score);
}

/** Label a stored vote regardless of mode. */
export function voteLabel(
  scoring: Scoring | undefined,
  vote: { scoreBinary?: BinaryChoice | null; scoreNumeric?: number | null },
): string {
  if (vote.scoreNumeric != null) return numericVoteLabel(scoring, vote.scoreNumeric);
  if (vote.scoreBinary) return binaryVoteLabel(scoring, vote.scoreBinary);
  return "—";
}
