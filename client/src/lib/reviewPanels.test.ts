import { describe, it, expect } from "vitest";
import { resolveExpandedPanels, DEFAULT_EXPANDED_PANELS } from "./reviewPanels";

describe("resolveExpandedPanels", () => {
  it("defaults to instructions open when nothing is stored", () => {
    expect(resolveExpandedPanels(null)).toEqual(DEFAULT_EXPANDED_PANELS);
    expect(resolveExpandedPanels(null)).toContain("instructions");
  });

  it("respects a stored array that omits instructions (deliberate collapse)", () => {
    expect(resolveExpandedPanels(JSON.stringify([]))).toEqual([]);
    expect(resolveExpandedPanels(JSON.stringify(["llm-reasoning"]))).toEqual(["llm-reasoning"]);
  });

  it("uses a stored array verbatim when it includes instructions", () => {
    expect(resolveExpandedPanels(JSON.stringify(["instructions", "llm-reasoning"]))).toEqual([
      "instructions",
      "llm-reasoning",
    ]);
  });

  it("falls back to default on malformed JSON without throwing", () => {
    expect(resolveExpandedPanels("not json{")).toEqual(DEFAULT_EXPANDED_PANELS);
  });

  it("falls back to default when the stored value is not an array", () => {
    expect(resolveExpandedPanels(JSON.stringify({ instructions: true }))).toEqual(DEFAULT_EXPANDED_PANELS);
  });

  it("drops non-string entries from a stored array", () => {
    expect(resolveExpandedPanels(JSON.stringify(["instructions", 42, null]))).toEqual(["instructions"]);
  });

  it("does not return the shared module-level default array (no mutation leak)", () => {
    const result = resolveExpandedPanels(null);
    expect(result).not.toBe(DEFAULT_EXPANDED_PANELS);
  });
});
