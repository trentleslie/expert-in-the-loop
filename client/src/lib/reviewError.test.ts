import { describe, it, expect } from "vitest";
import { classifyReviewError } from "./reviewError";

// The default query function throws `Error("<status>: <body>")`. A non-member
// hitting a campaign's review/next-pair endpoint gets 404; a participant who
// oversteps gets 403. Both are access denials that must NOT be shown as a
// retryable technical error. Everything else stays "generic" (Try Again).

describe("classifyReviewError", () => {
  it("treats a 404 as an access denial", () => {
    expect(classifyReviewError(new Error('404: {"message":"Not found"}'))).toBe("access");
  });

  it("treats a 403 as an access denial", () => {
    expect(classifyReviewError(new Error("403: Forbidden"))).toBe("access");
  });

  it("treats a 500 as a generic (retryable) error", () => {
    expect(classifyReviewError(new Error("500: Internal Server Error"))).toBe("generic");
  });

  it("treats a network error (no status) as generic", () => {
    expect(classifyReviewError(new TypeError("Failed to fetch"))).toBe("generic");
  });

  it("does not misread a status embedded later in the message", () => {
    expect(classifyReviewError(new Error("Boom: got 404 downstream"))).toBe("generic");
  });

  it("handles null/undefined without throwing", () => {
    expect(classifyReviewError(null)).toBe("generic");
    expect(classifyReviewError(undefined)).toBe("generic");
  });
});
