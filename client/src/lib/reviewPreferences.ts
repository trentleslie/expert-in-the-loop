// Per-reviewer, per-browser preferences for the review page (localStorage).

export const CONFIRM_BEFORE_SUBMIT_KEY = "review-confirm-before-submit";

/**
 * Whether the vote/skip confirmation dialog should be shown.
 * Defaults to `true` (confirm) when unset or unreadable — never throws.
 * Only the literal string "false" disables confirmation.
 */
export function getConfirmBeforeSubmit(): boolean {
  try {
    return localStorage.getItem(CONFIRM_BEFORE_SUBMIT_KEY) !== "false";
  } catch {
    return true;
  }
}

/** Persist the confirmation preference. Swallows storage errors. */
export function setConfirmBeforeSubmit(value: boolean): void {
  try {
    localStorage.setItem(CONFIRM_BEFORE_SUBMIT_KEY, value ? "true" : "false");
  } catch {
    /* ignore (private mode / quota) */
  }
}
