import { describe, it, expect } from "vitest";
import { partitionByMembership } from "./campaignFocus";

const c = (id: string) => ({ id });

describe("partitionByMembership", () => {
  it("splits joined vs others", () => {
    const { joined, others } = partitionByMembership([c("a"), c("b"), c("c")], ["a"]);
    expect(joined.map((x) => x.id)).toEqual(["a"]);
    expect(others.map((x) => x.id)).toEqual(["b", "c"]);
  });

  it("empty joined set → everything under others", () => {
    const { joined, others } = partitionByMembership([c("a"), c("b")], []);
    expect(joined).toEqual([]);
    expect(others.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("no campaigns → both empty", () => {
    expect(partitionByMembership([], ["a"])).toEqual({ joined: [], others: [] });
  });

  it("a joined id not in the active list is dropped from both (no dangling card)", () => {
    const { joined, others } = partitionByMembership([c("a")], ["a", "archived-since"]);
    expect(joined.map((x) => x.id)).toEqual(["a"]);
    expect(others).toEqual([]);
  });

  it("dedup — a campaign appears in exactly one bucket", () => {
    const { joined, others } = partitionByMembership([c("a"), c("b")], ["a"]);
    const ids = [...joined, ...others].map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
