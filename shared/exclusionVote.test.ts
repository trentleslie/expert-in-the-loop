import { describe, it, expect } from "vitest";
import { validateExcludedMembers } from "./exclusionVote";

const ids = ["a", "b", "c"];

describe("validateExcludedMembers", () => {
  it("accepts an empty selection (one concept)", () => {
    expect(validateExcludedMembers([], ids)).toBeNull();
  });

  it("accepts any subset of the pair's members, including all of them", () => {
    expect(validateExcludedMembers(["b"], ids)).toBeNull();
    expect(validateExcludedMembers(["c", "a", "b"], ids)).toBeNull();
  });

  it("rejects a missing or non-array selection", () => {
    expect(validateExcludedMembers(undefined, ids)).not.toBeNull();
    expect(validateExcludedMembers(null, ids)).not.toBeNull();
    expect(validateExcludedMembers("a", ids)).not.toBeNull();
  });

  it("rejects non-string ids", () => {
    expect(validateExcludedMembers(["a", 2], ids)).toMatch(/strings/);
  });

  it("rejects an id that is not a member of the pair", () => {
    expect(validateExcludedMembers(["a", "zzz"], ids)).toMatch(/unknown member id "zzz"/);
  });

  it("rejects a duplicated id", () => {
    expect(validateExcludedMembers(["a", "a"], ids)).toMatch(/more than once/);
  });

  it("rejects any vote on a pair with no members", () => {
    expect(validateExcludedMembers([], [])).toMatch(/no member variables/);
  });
});
