import { describe, it, expect, beforeEach } from "vitest";
import {
  computeEvidenceStatus,
  evidenceStatusMetrics,
  type VoteForScoring,
} from "./evidenceStatus";
import { DEFAULT_CAMPAIGN_CONFIG, type CampaignConfig } from "@shared/campaignConfig";

// --- helpers ---------------------------------------------------------------
const bin = (s: VoteForScoring["scoreBinary"]): VoteForScoring => ({
  scoreBinary: s,
  scoreNumeric: null,
});
const num = (n: number): VoteForScoring => ({ scoreBinary: null, scoreNumeric: n });
// A partition vote of `n` groups (only the group COUNT matters to consensus): 1 ⇒ coherent, >1 ⇒ over-merge.
const part = (n: number): VoteForScoring => ({
  scoreBinary: null,
  scoreNumeric: null,
  scorePartition: { groups: Array.from({ length: n }, (_, i) => [`m${i}`]) },
});
const partNull = (): VoteForScoring => ({ scoreBinary: null, scoreNumeric: null, scorePartition: null });

function partitionConfig(consensus: Partial<CampaignConfig["consensus"]> = {}): CampaignConfig {
  return {
    ...DEFAULT_CAMPAIGN_CONFIG,
    scoring: { mode: "partition", partition: { maxGroups: 8 } },
    consensus: { minVotes: 2, confirmPct: 70, rejectPct: 70, ...consensus },
  };
}

function binaryConfig(consensus: Partial<CampaignConfig["consensus"]> = {}): CampaignConfig {
  return {
    ...DEFAULT_CAMPAIGN_CONFIG,
    scoring: {
      mode: "binary",
      binary: { labels: { positive: "Match", negative: "No Match", neutral: "Unsure" } },
    },
    consensus: { minVotes: 2, confirmPct: 70, rejectPct: 70, ...consensus },
  };
}

function numericConfig(consensus: Partial<CampaignConfig["consensus"]> = {}): CampaignConfig {
  return {
    ...DEFAULT_CAMPAIGN_CONFIG,
    scoring: { mode: "numeric", numeric: { min: 1, max: 5 } },
    consensus: {
      minVotes: 2,
      confirmPct: 70,
      rejectPct: 70,
      numericConfirmThreshold: 3.5,
      numericRejectThreshold: 2.0,
      ...consensus,
    },
  };
}

describe("computeEvidenceStatus — gating", () => {
  it("returns unreviewed with zero active votes", () => {
    expect(computeEvidenceStatus(binaryConfig(), [])).toBe("unreviewed");
  });

  it("returns in_review when active votes < minVotes", () => {
    expect(computeEvidenceStatus(binaryConfig({ minVotes: 3 }), [bin("match")])).toBe(
      "in_review",
    );
  });

  it("DEFAULT config (minVotes 2) leaves a single vote in_review", () => {
    expect(computeEvidenceStatus(DEFAULT_CAMPAIGN_CONFIG, [bin("match")])).toBe("in_review");
  });
});

describe("computeEvidenceStatus — binary", () => {
  it("2 match + 1 no_match @ confirm 70 → disputed (67%)", () => {
    const votes = [bin("match"), bin("match"), bin("no_match")];
    expect(computeEvidenceStatus(binaryConfig(), votes)).toBe("disputed");
  });

  it("3 match @ confirm 70 → expert_confirmed (100%)", () => {
    const votes = [bin("match"), bin("match"), bin("match")];
    expect(computeEvidenceStatus(binaryConfig(), votes)).toBe("expert_confirmed");
  });

  it("3 no_match @ reject 70 → expert_rejected (100%)", () => {
    const votes = [bin("no_match"), bin("no_match"), bin("no_match")];
    expect(computeEvidenceStatus(binaryConfig(), votes)).toBe("expert_rejected");
  });

  it("unsure counts in the denominator: 2 match + 1 unsure → disputed (66.7%, not 100%)", () => {
    const votes = [bin("match"), bin("match"), bin("unsure")];
    expect(computeEvidenceStatus(binaryConfig(), votes)).toBe("disputed");
  });

  it("all unsure → disputed (0% match, 0% no_match — not rejected)", () => {
    const votes = [bin("unsure"), bin("unsure")];
    expect(computeEvidenceStatus(binaryConfig(), votes)).toBe("disputed");
  });

  it("exactly at the confirm threshold confirms (>=)", () => {
    // 7 of 10 match = 70% == confirmPct
    const votes = [...Array(7).fill(bin("match")), ...Array(3).fill(bin("no_match"))];
    expect(computeEvidenceStatus(binaryConfig({ minVotes: 1 }), votes)).toBe(
      "expert_confirmed",
    );
  });
});

describe("computeEvidenceStatus — numeric", () => {
  it("scores 4,5,4 @ confirmThreshold 3.5 → expert_confirmed (mean 4.33)", () => {
    expect(computeEvidenceStatus(numericConfig(), [num(4), num(5), num(4)])).toBe(
      "expert_confirmed",
    );
  });

  it("scores 1,2,1 @ rejectThreshold 2.0 → expert_rejected (mean 1.33)", () => {
    expect(computeEvidenceStatus(numericConfig(), [num(1), num(2), num(1)])).toBe(
      "expert_rejected",
    );
  });

  it("mean strictly between thresholds → disputed", () => {
    // mean of 3,3 = 3.0: below confirm (3.5), above reject (2.0)
    expect(computeEvidenceStatus(numericConfig(), [num(3), num(3)])).toBe("disputed");
  });

  it("mean exactly at reject threshold → expert_rejected (<=)", () => {
    expect(computeEvidenceStatus(numericConfig(), [num(2), num(2)])).toBe("expert_rejected");
  });
});

describe("computeEvidenceStatus — partition", () => {
  it("all one-group votes @ confirm 70 → expert_confirmed (coherent)", () => {
    expect(computeEvidenceStatus(partitionConfig(), [part(1), part(1)])).toBe("expert_confirmed");
  });

  it("all multi-group votes @ reject 70 → expert_rejected (over-merge)", () => {
    expect(computeEvidenceStatus(partitionConfig(), [part(2), part(3)])).toBe("expert_rejected");
  });

  it("split coherent/over-merge below both thresholds → disputed", () => {
    // 2 coherent + 1 over-merge of 3 = 67% coherent (< 70), 33% over-merge (< 70)
    expect(computeEvidenceStatus(partitionConfig(), [part(1), part(1), part(2)])).toBe("disputed");
  });

  it("ungrouped (null) votes stay in the denominator, contributing to neither side", () => {
    // 2 coherent + 1 null of 3 = 67% coherent (< 70) → disputed, not confirmed
    expect(computeEvidenceStatus(partitionConfig(), [part(1), part(1), partNull()])).toBe("disputed");
    // 3 coherent + 1 null of 4 = 75% (>= 70) → confirmed
    expect(
      computeEvidenceStatus(partitionConfig(), [part(1), part(1), part(1), partNull()]),
    ).toBe("expert_confirmed");
  });

  it("respects the minVotes gate", () => {
    expect(computeEvidenceStatus(partitionConfig({ minVotes: 2 }), [part(1)])).toBe("in_review");
  });
});

describe("computeEvidenceStatus — observable fallback", () => {
  beforeEach(() => {
    evidenceStatusMetrics.fallbacks = 0;
  });

  it("numeric config missing thresholds → in_review sentinel AND increments the fallback metric", () => {
    const broken = numericConfig();
    // simulate a config/logic bug: thresholds absent on a numeric campaign
    broken.consensus.numericConfirmThreshold = undefined;
    broken.consensus.numericRejectThreshold = undefined;
    expect(computeEvidenceStatus(broken, [num(4), num(5)])).toBe("in_review");
    expect(evidenceStatusMetrics.fallbacks).toBe(1);
  });

  it("NaN scores trigger the observable fallback, not a silent disputed", () => {
    // Enough votes to pass the minVotes gate so we actually reach the numeric
    // path; both scores are NaN, so the filtered set is empty -> fallback fires.
    const result = computeEvidenceStatus(numericConfig({ minVotes: 2 }), [
      num(NaN),
      num(NaN),
    ]);
    expect(result).toBe("in_review");
    expect(evidenceStatusMetrics.fallbacks).toBe(1);
  });
});
