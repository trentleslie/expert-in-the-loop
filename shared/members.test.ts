import { describe, it, expect } from "vitest";
import { parseMembers } from "./members";

describe("parseMembers", () => {
  it("returns well-formed members unchanged", () => {
    const members = [
      { id: "a", text: "Systolic BP" },
      { id: "b", text: "Diastolic BP" },
    ];
    expect(parseMembers({ members })).toEqual(members);
  });

  it("returns [] when metadata or members is missing or not an array", () => {
    expect(parseMembers(null)).toEqual([]);
    expect(parseMembers(undefined)).toEqual([]);
    expect(parseMembers("members")).toEqual([]);
    expect(parseMembers({})).toEqual([]);
    expect(parseMembers({ members: "a,b" })).toEqual([]);
    expect(parseMembers({ members: { id: "a", text: "A" } })).toEqual([]);
  });

  it("drops entries without a usable string id", () => {
    expect(
      parseMembers({
        members: [
          null,
          "a",
          { text: "no id" },
          { id: 7, text: "numeric id" },
          { id: "  ", text: "blank id" },
          { id: "ok", text: "kept" },
        ],
      }),
    ).toEqual([{ id: "ok", text: "kept" }]);
  });

  it("keeps the first entry for a repeated id", () => {
    expect(
      parseMembers({
        members: [
          { id: "a", text: "first" },
          { id: "a", text: "second" },
          { id: "b", text: "other" },
        ],
      }),
    ).toEqual([
      { id: "a", text: "first" },
      { id: "b", text: "other" },
    ]);
  });

  it("falls back to the id when text is missing or not a string", () => {
    expect(parseMembers({ members: [{ id: "a" }, { id: "b", text: 3 }, { id: "c", text: "" }] })).toEqual([
      { id: "a", text: "a" },
      { id: "b", text: "b" },
      { id: "c", text: "c" },
    ]);
  });
});
