import { describe, it, expect } from "vitest";
import {
  deriveRoleById,
  sortByOwnership,
  MEMBERSHIP_ROW_KEYS,
  hasOnlyMembershipKeys,
} from "./campaignFocus";

// Factory: a campaign object carrying just the fields the helpers read.
const c = (id: string, viewerRole?: "owner" | "participant" | null) =>
  viewerRole === undefined ? { id } : { id, viewerRole };

describe("deriveRoleById", () => {
  it("maps each campaign to its viewerRole", () => {
    const roles = deriveRoleById([c("a", "owner"), c("b", "participant")], false);
    expect(roles).toEqual({ a: "owner", b: "participant" });
  });

  it("null/undefined viewerRole defaults to participant", () => {
    const roles = deriveRoleById([c("a", null), c("b")], false);
    expect(roles).toEqual({ a: "participant", b: "participant" });
  });

  it("isAdmin folds every visible campaign to implicit owner", () => {
    // Admin campaigns may carry viewerRole: null — admin still overrides to owner.
    const roles = deriveRoleById([c("a", null), c("b", "participant")], true);
    expect(roles).toEqual({ a: "owner", b: "owner" });
  });

  it("empty list → empty map", () => {
    expect(deriveRoleById([], false)).toEqual({});
    expect(deriveRoleById([], true)).toEqual({});
  });
});

describe("sortByOwnership", () => {
  it("orders owners before participants", () => {
    const ordered = sortByOwnership(
      [c("p1"), c("o1"), c("p2"), c("o2")],
      { o1: "owner", o2: "owner", p1: "participant", p2: "participant" },
    );
    expect(ordered.map((x) => x.id)).toEqual(["o1", "o2", "p1", "p2"]);
  });

  it("is stable within each group (preserves input order)", () => {
    const ordered = sortByOwnership(
      [c("o2"), c("p1"), c("o1"), c("p2")],
      { o1: "owner", o2: "owner", p1: "participant", p2: "participant" },
    );
    // owners in their original relative order, then participants in theirs
    expect(ordered.map((x) => x.id)).toEqual(["o2", "o1", "p1", "p2"]);
  });

  it("participant-only list is unchanged", () => {
    const ordered = sortByOwnership([c("a"), c("b")], { a: "participant", b: "participant" });
    expect(ordered.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("empty list → empty", () => {
    expect(sortByOwnership([], {})).toEqual([]);
  });

  it("unknown id (missing from roleById) defaults to the participant tail", () => {
    const ordered = sortByOwnership(
      [c("unknown"), c("o1")],
      { o1: "owner" },
    );
    expect(ordered.map((x) => x.id)).toEqual(["o1", "unknown"]);
  });

  it("does not mutate the input array", () => {
    const input = [c("p1"), c("o1")];
    sortByOwnership(input, { o1: "owner", p1: "participant" });
    expect(input.map((x) => x.id)).toEqual(["p1", "o1"]);
  });
});

describe("blinding — membership/roster row shape (R10)", () => {
  const validRow = {
    userId: "u1",
    email: "a@b.co",
    displayName: "A",
    role: "owner" as const,
    joinedAt: "2026-07-21T00:00:00.000Z",
  };

  it("allowed keys are exactly identity + role + joinedAt", () => {
    expect(MEMBERSHIP_ROW_KEYS).toEqual([
      "userId",
      "email",
      "displayName",
      "role",
      "joinedAt",
    ]);
  });

  it("a clean roster row passes the guard", () => {
    expect(hasOnlyMembershipKeys(validRow)).toBe(true);
  });

  it("a row leaking a provenance/candidate field fails the guard", () => {
    expect(hasOnlyMembershipKeys({ ...validRow, machinePick: "X" })).toBe(false);
    expect(hasOnlyMembershipKeys({ ...validRow, candidateId: "c1" })).toBe(false);
    expect(hasOnlyMembershipKeys({ ...validRow, sourceId: "s1" })).toBe(false);
  });
});
