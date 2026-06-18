// Per-admin, per-browser preferences for the admin campaigns page (localStorage).

export const ARCHIVED_COLLAPSED_KEY = "admin-archived-section-collapsed";

/**
 * Whether the "Archived Campaigns" section is collapsed.
 * Defaults to `true` (collapsed, to declutter) when unset or unreadable — never
 * throws. Only the literal string "false" expands it.
 */
export function getArchivedSectionCollapsed(): boolean {
  try {
    return localStorage.getItem(ARCHIVED_COLLAPSED_KEY) !== "false";
  } catch {
    return true;
  }
}

/** Persist the archived-section collapsed preference. Swallows storage errors. */
export function setArchivedSectionCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(ARCHIVED_COLLAPSED_KEY, collapsed ? "true" : "false");
  } catch {
    /* ignore (private mode / quota) */
  }
}
