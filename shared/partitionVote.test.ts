import { describe, it, expect } from "vitest";
import { validatePartitionGroups } from "./partitionVote";

const ids = ["a", "b", "c"];

describe("validatePartitionGroups", () => {
  it("accepts a single group holding every member (coherent)", () => {
    expect(validatePartitionGroups([["a", "b", "c"]], ids, 6)).toBeNull();
  });

  it("accepts a multi-group partition in any order", () => {
    expect(validatePartitionGroups([["c"], ["b", "a"]], ids, 6)).toBeNull();
  });

  it("rejects a missing, non-array or empty grouping", () => {
    expect(validatePartitionGroups(undefined, ids, 6)).not.toBeNull();
    expect(validatePartitionGroups({ 0: ["a"] }, ids, 6)).not.toBeNull();
    expect(validatePartitionGroups([], ids, 6)).not.toBeNull();
  });

  it("rejects an empty group, which would inflate the group count", () => {
    expect(validatePartitionGroups([["a", "b", "c"], []], ids, 6)).toMatch(/non-empty/);
  });

  it("rejects a non-array group and non-string ids", () => {
    expect(validatePartitionGroups(["abc"], ids, 6)).not.toBeNull();
    expect(validatePartitionGroups([["a", "b", 3]], ids, 6)).toMatch(/strings/);
  });

  it("rejects an id that is not a member of the pair", () => {
    expect(validatePartitionGroups([["a", "b", "c", "zzz"]], ids, 6)).toMatch(/unknown member id "zzz"/);
  });

  it("rejects a member assigned twice, within or across groups", () => {
    expect(validatePartitionGroups([["a", "a", "b", "c"]], ids, 6)).toMatch(/more than once/);
    expect(validatePartitionGroups([["a", "b"], ["b", "c"]], ids, 6)).toMatch(/more than once/);
  });

  it("rejects a grouping that omits a member", () => {
    expect(validatePartitionGroups([["a"], ["b"]], ids, 6)).toMatch(/every member/);
  });

  it("rejects more groups than the campaign allows", () => {
    expect(validatePartitionGroups([["a"], ["b"], ["c"]], ids, 2)).toMatch(/at most 2/);
  });

  it("rejects any vote on a pair with no members", () => {
    expect(validatePartitionGroups([["a"]], [], 6)).toMatch(/no member variables/);
  });
});
