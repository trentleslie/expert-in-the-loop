import { describe, it, expect } from "vitest";
import { updateCampaignDetailsSchema } from "./schema";

describe("updateCampaignDetailsSchema", () => {
  it("accepts valid name/description/instructions and passes them through", () => {
    const result = updateCampaignDetailsSchema.parse({
      name: "Q4 Review",
      description: "Some description",
      instructions: "Judge each pair carefully.",
    });
    expect(result).toEqual({
      name: "Q4 Review",
      description: "Some description",
      instructions: "Judge each pair carefully.",
    });
  });

  it("trims the name", () => {
    expect(updateCampaignDetailsSchema.parse({ name: "  Padded  " }).name).toBe("Padded");
  });

  it("coerces empty / whitespace-only description and instructions to null", () => {
    const result = updateCampaignDetailsSchema.parse({
      name: "Campaign",
      description: "",
      instructions: "   ",
    });
    expect(result.description).toBeNull();
    expect(result.instructions).toBeNull();
  });

  it("allows description/instructions to be omitted (partial) -> null", () => {
    const result = updateCampaignDetailsSchema.parse({ name: "Campaign" });
    expect(result.description).toBeNull();
    expect(result.instructions).toBeNull();
  });

  it("accepts instructions of exactly 2000 chars but rejects 2001", () => {
    const name = "Campaign";
    expect(() => updateCampaignDetailsSchema.parse({ name, instructions: "x".repeat(2000) })).not.toThrow();
    expect(() => updateCampaignDetailsSchema.parse({ name, instructions: "x".repeat(2001) })).toThrow();
  });

  it("accepts a name of exactly 255 chars but rejects 256", () => {
    expect(() => updateCampaignDetailsSchema.parse({ name: "x".repeat(255) })).not.toThrow();
    expect(() => updateCampaignDetailsSchema.parse({ name: "x".repeat(256) })).toThrow();
  });

  it("rejects an empty or whitespace-only name", () => {
    expect(() => updateCampaignDetailsSchema.parse({ name: "" })).toThrow();
    expect(() => updateCampaignDetailsSchema.parse({ name: "   " })).toThrow();
  });

  it("strips unknown keys (defense against mass-assignment at the schema layer)", () => {
    const result = updateCampaignDetailsSchema.parse({
      name: "Campaign",
      campaignType: "loinc_mapping",
      createdBy: "attacker",
      status: "archived",
    } as Record<string, unknown>);
    expect(result).not.toHaveProperty("campaignType");
    expect(result).not.toHaveProperty("createdBy");
    expect(result).not.toHaveProperty("status");
  });
});
