// Persisted open/closed state for the review page's collapsible context panels.
// Stored as a JSON string array under one localStorage key. A fresh reviewer
// (no stored value) gets the instructions panel open by default; once they
// interact, their stored preference wins — including a deliberate collapse.

export const REVIEW_PANELS_STORAGE_KEY = "review-expanded-panels";

// Panels open by default when the reviewer has no saved preference.
export const DEFAULT_EXPANDED_PANELS: string[] = ["instructions"];

/**
 * Resolve the initial set of open panels from a raw localStorage value.
 * - `null` (never stored) -> default (instructions open)
 * - a valid JSON string array -> use it verbatim (an empty array means the
 *   reviewer collapsed everything; that preference is respected)
 * - malformed JSON / non-array -> fall back to default, never throws
 */
export function resolveExpandedPanels(raw: string | null): string[] {
  if (raw === null) return [...DEFAULT_EXPANDED_PANELS];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((v): v is string => typeof v === "string");
    }
    return [...DEFAULT_EXPANDED_PANELS];
  } catch {
    return [...DEFAULT_EXPANDED_PANELS];
  }
}

/**
 * Read the persisted panel state from localStorage, falling back to the default
 * if storage access itself throws (private mode, storage disabled by policy).
 */
export function getStoredExpandedPanels(): string[] {
  try {
    return resolveExpandedPanels(localStorage.getItem(REVIEW_PANELS_STORAGE_KEY));
  } catch {
    return [...DEFAULT_EXPANDED_PANELS];
  }
}
