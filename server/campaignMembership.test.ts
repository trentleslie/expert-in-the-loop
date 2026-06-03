import { describe, it, expect } from "vitest";
import { isCampaignJoinable } from "./campaignMembership";

describe("isCampaignJoinable", () => {
  it("allows active campaigns", () => {
    expect(isCampaignJoinable("active")).toBe(true);
  });

  it("rejects draft / completed / archived (would create dead memberships)", () => {
    expect(isCampaignJoinable("draft")).toBe(false);
    expect(isCampaignJoinable("completed")).toBe(false);
    expect(isCampaignJoinable("archived")).toBe(false);
  });
});
