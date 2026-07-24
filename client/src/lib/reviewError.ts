// Classifies a failed review-page query so the UI can tell an *access* denial
// apart from a genuine *technical* failure. The default query function throws
// `Error("<status>: <body>")` (see queryClient.ts `throwIfResNotOk`), so the
// HTTP status is the leading token of the message.
//
// Why this exists: a non-member who opens a campaign's review URL gets a clean
// 404 from the API, but the page used to render it as "Unable to Load Review —
// please try again," dressing a permission boundary up as a retryable outage.
// "access" cases should offer a way *out* (go home), not a Try Again button.

export type ReviewErrorKind = "access" | "generic";

/** 403 (forbidden) and 404 (not found / not a member) are access denials. */
export function classifyReviewError(error: unknown): ReviewErrorKind {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const match = /^(\d{3})\b/.exec(message);
  const status = match ? Number(match[1]) : null;
  return status === 403 || status === 404 ? "access" : "generic";
}
