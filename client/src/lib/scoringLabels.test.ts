import { describe, it, expect } from "vitest";
import { binaryVoteLabel, numericVoteLabel, partitionVoteLabel, voteLabel } from "./scoringLabels";
import type { CampaignConfig } from "@shared/campaignConfig";

const binary = (pos = "Yes", neg = "No", neu = "Maybe"): CampaignConfig["scoring"] => ({
  mode: "binary",
  binary: { labels: { positive: pos, negative: neg, neutral: neu } },
});

const numeric = (labels?: Record<string, string>): CampaignConfig["scoring"] => ({
  mode: "numeric",
  numeric: { min: 1, max: 5, labels },
});

describe("binaryVoteLabel", () => {
  it("returns the campaign's configured labels", () => {
    const s = binary("Same", "Different", "Unsure");
    expect(binaryVoteLabel(s, "match")).toBe("Same");
    expect(binaryVoteLabel(s, "no_match")).toBe("Different");
    expect(binaryVoteLabel(s, "unsure")).toBe("Unsure");
  });

  it("falls back to generic vote words (not tier words) without a binary config", () => {
    expect(binaryVoteLabel(undefined, "match")).toBe("Match");
    expect(binaryVoteLabel(numeric(), "no_match")).toBe("No Match");
    expect(binaryVoteLabel(undefined, "unsure")).toBe("Unsure");
  });
});

describe("numericVoteLabel", () => {
  it("uses the per-value label when configured, else the raw score", () => {
    const s = numeric({ "5": "Exact", "1": "Unrelated" });
    expect(numericVoteLabel(s, 5)).toBe("Exact");
    expect(numericVoteLabel(s, 3)).toBe("3");
    expect(numericVoteLabel(numeric(), 4)).toBe("4");
  });
});

describe("partitionVoteLabel", () => {
  it("labels one group as coherent and more as an over-merge", () => {
    expect(partitionVoteLabel([["a", "b", "c"]])).toBe("One concept");
    expect(partitionVoteLabel([["a"], ["b", "c"]])).toBe("Over-merge (2 concepts)");
    expect(partitionVoteLabel(null)).toBe("—");
  });
});

describe("voteLabel", () => {
  it("routes by which score is present", () => {
    expect(voteLabel(binary("Same", "Diff", "?"), { scoreBinary: "match", scoreNumeric: null })).toBe("Same");
    expect(voteLabel(numeric({ "2": "Low" }), { scoreBinary: null, scoreNumeric: 2 })).toBe("Low");
    expect(voteLabel(undefined, { scoreBinary: null, scoreNumeric: null })).toBe("—");
  });

  it("routes a partition vote to the partition label", () => {
    expect(
      voteLabel(undefined, { scoreBinary: null, scoreNumeric: null, scorePartition: { groups: [["a"], ["b"]] } }),
    ).toBe("Over-merge (2 concepts)");
  });
});
