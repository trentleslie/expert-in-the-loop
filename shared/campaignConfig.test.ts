import { describe, it, expect } from "vitest";
import { campaignConfigSchema, DEFAULT_CAMPAIGN_CONFIG, defaultNumericThresholds } from "./campaignConfig";

describe("campaignConfigSchema", () => {
  it("accepts the default (binary) config", () => {
    expect(campaignConfigSchema.safeParse(DEFAULT_CAMPAIGN_CONFIG).success).toBe(true);
  });

  it("accepts a partition config (maxGroups defaulted)", () => {
    const cfg = {
      scoring: { mode: "partition", partition: {} },
      consensus: { minVotes: 2, confirmPct: 70, rejectPct: 70 },
      display: { showExternalLinks: false, showAlternatives: false, showMetadataPanel: true },
      import: { sourcePrefixFilter: false },
    };
    const parsed = campaignConfigSchema.safeParse(cfg);
    expect(parsed.success).toBe(true);
    if (parsed.success && parsed.data.scoring.mode === "partition") {
      expect(parsed.data.scoring.partition.maxGroups).toBe(8); // schema default
    }
  });

  it("rejects a partition config with maxGroups out of range", () => {
    const cfg = {
      scoring: { mode: "partition", partition: { maxGroups: 99 } },
      consensus: { minVotes: 2, confirmPct: 70, rejectPct: 70 },
      display: { showExternalLinks: false, showAlternatives: false, showMetadataPanel: true },
      import: { sourcePrefixFilter: false },
    };
    expect(campaignConfigSchema.safeParse(cfg).success).toBe(false);
  });

  it("accepts a numeric config with valid thresholds (confirm > reject)", () => {
    const cfg = {
      scoring: { mode: "numeric", numeric: { min: 1, max: 5 } },
      consensus: {
        minVotes: 2,
        confirmPct: 70,
        rejectPct: 70,
        numericConfirmThreshold: 3.5,
        numericRejectThreshold: 2.0,
      },
      display: { showExternalLinks: false, showAlternatives: false, showMetadataPanel: true },
      import: { sourcePrefixFilter: false },
    };
    expect(campaignConfigSchema.safeParse(cfg).success).toBe(true);
  });

  it("rejects a numeric config missing the numeric thresholds", () => {
    const cfg = {
      scoring: { mode: "numeric", numeric: { min: 1, max: 5 } },
      consensus: { minVotes: 2, confirmPct: 70, rejectPct: 70 },
      display: { showExternalLinks: false, showAlternatives: false, showMetadataPanel: true },
      import: { sourcePrefixFilter: false },
    };
    const result = campaignConfigSchema.safeParse(cfg);
    expect(result.success).toBe(false);
  });

  it("rejects inverted numeric thresholds (confirm <= reject)", () => {
    const cfg = {
      scoring: { mode: "numeric", numeric: { min: 1, max: 5 } },
      consensus: {
        minVotes: 2,
        confirmPct: 70,
        rejectPct: 70,
        numericConfirmThreshold: 2.0,
        numericRejectThreshold: 3.5,
      },
      display: { showExternalLinks: false, showAlternatives: false, showMetadataPanel: true },
      import: { sourcePrefixFilter: false },
    };
    expect(campaignConfigSchema.safeParse(cfg).success).toBe(false);
  });

  it("rejects a non-https linkTemplate", () => {
    const cfg = {
      ...DEFAULT_CAMPAIGN_CONFIG,
      display: { ...DEFAULT_CAMPAIGN_CONFIG.display, showExternalLinks: true, linkTemplate: "javascript:alert({targetId})" },
    };
    expect(campaignConfigSchema.safeParse(cfg).success).toBe(false);
  });

  it("accepts an https linkTemplate containing {targetId}", () => {
    const cfg = {
      ...DEFAULT_CAMPAIGN_CONFIG,
      display: { ...DEFAULT_CAMPAIGN_CONFIG.display, showExternalLinks: true, linkTemplate: "https://loinc.org/{targetId}" },
    };
    expect(campaignConfigSchema.safeParse(cfg).success).toBe(true);
  });
});

describe("defaultNumericThresholds", () => {
  it.each([
    [1, 5],
    [1, 10],
    [1, 100],
    [1, 3], // mid-span that would otherwise collide on rounding
    [1, 2],
    [0, 4],
  ])("returns reject < confirm within [%i, %i]", (min, max) => {
    const { numericConfirmThreshold: confirm, numericRejectThreshold: reject } =
      defaultNumericThresholds(min, max);
    expect(reject).toBeGreaterThanOrEqual(min);
    expect(confirm).toBeLessThanOrEqual(max);
    expect(confirm).toBeGreaterThan(reject);
  });

  it("produces a config the schema accepts for numeric scoring", () => {
    const thresholds = defaultNumericThresholds(1, 5);
    const cfg = {
      ...DEFAULT_CAMPAIGN_CONFIG,
      scoring: { mode: "numeric" as const, numeric: { min: 1, max: 5 } },
      consensus: { ...DEFAULT_CAMPAIGN_CONFIG.consensus, ...thresholds },
    };
    expect(campaignConfigSchema.safeParse(cfg).success).toBe(true);
  });
});
