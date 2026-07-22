import { describe, it, expect } from "vitest";
import { computeBackfillRoles, type BackfillInput } from "./campaignBackfill";

// Pure-logic mirror of scripts/backfill/0001_campaign_access_roles.backfill.sql.
// Verifies the role assignments the SQL produces without standing up a DB.

const C1 = "c1";
const C2 = "c2";

describe("computeBackfillRoles", () => {
  it("assigns owner to a creator with no prior membership (step 2b)", () => {
    const input: BackfillInput = {
      creators: [{ campaignId: C1, userId: "alice" }],
      voters: [],
      existingMemberships: [],
    };
    expect(computeBackfillRoles(input)).toEqual([
      { campaignId: C1, userId: "alice", role: "owner" },
    ]);
  });

  it("promotes an existing participant membership when the user is the creator (step 2a)", () => {
    const input: BackfillInput = {
      creators: [{ campaignId: C1, userId: "alice" }],
      voters: [],
      existingMemberships: [{ campaignId: C1, userId: "alice", role: "participant" }],
    };
    expect(computeBackfillRoles(input)).toEqual([
      { campaignId: C1, userId: "alice", role: "owner" },
    ]);
  });

  it("assigns participant to a voter with no prior membership (step 3)", () => {
    const input: BackfillInput = {
      creators: [{ campaignId: C1, userId: "alice" }],
      voters: [{ campaignId: C1, userId: "bob" }],
      existingMemberships: [],
    };
    const result = computeBackfillRoles(input);
    expect(result).toContainEqual({ campaignId: C1, userId: "bob", role: "participant" });
    expect(result).toContainEqual({ campaignId: C1, userId: "alice", role: "owner" });
  });

  it("excludes skip-only users (they are not voters, so no membership row is created)", () => {
    const input: BackfillInput = {
      creators: [{ campaignId: C1, userId: "alice" }],
      voters: [],
      existingMemberships: [],
      // "carol" only skipped — never appears in voters and gets no row.
    };
    const result = computeBackfillRoles(input);
    expect(result.some((r) => r.userId === "carol")).toBe(false);
  });

  it("never demotes an owner when the same user is also a voter (ON CONFLICT DO NOTHING)", () => {
    const input: BackfillInput = {
      creators: [{ campaignId: C1, userId: "alice" }],
      // alice both created and voted; step 3 must not overwrite her owner role.
      voters: [{ campaignId: C1, userId: "alice" }],
      existingMemberships: [],
    };
    expect(computeBackfillRoles(input)).toEqual([
      { campaignId: C1, userId: "alice", role: "owner" },
    ]);
  });

  it("keeps roles scoped per-campaign (a voter in C1 is not a member of C2)", () => {
    const input: BackfillInput = {
      creators: [
        { campaignId: C1, userId: "alice" },
        { campaignId: C2, userId: "dave" },
      ],
      voters: [{ campaignId: C1, userId: "bob" }],
      existingMemberships: [],
    };
    const result = computeBackfillRoles(input);
    expect(result.some((r) => r.userId === "bob" && r.campaignId === C2)).toBe(false);
    expect(result).toContainEqual({ campaignId: C2, userId: "dave", role: "owner" });
  });

  it("is idempotent: feeding its own output back as existing memberships is stable", () => {
    const input: BackfillInput = {
      creators: [{ campaignId: C1, userId: "alice" }],
      voters: [
        { campaignId: C1, userId: "bob" },
        { campaignId: C1, userId: "alice" },
      ],
      existingMemberships: [],
    };
    const first = computeBackfillRoles(input);
    const second = computeBackfillRoles({ ...input, existingMemberships: first });
    expect(second).toEqual(first);
  });
});
