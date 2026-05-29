import { describe, it, expect } from "vitest";
import { campaignConfigSchema, DEFAULT_CAMPAIGN_CONFIG } from "./campaignConfig";

describe("campaignConfigSchema", () => {
  it("accepts the default (binary) config", () => {
    expect(campaignConfigSchema.safeParse(DEFAULT_CAMPAIGN_CONFIG).success).toBe(true);
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
