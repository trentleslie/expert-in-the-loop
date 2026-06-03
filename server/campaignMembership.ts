// Pure helper for the campaign-join route. Extracted so the eligibility rule is
// unit-testable without Express/DB. A campaign is joinable only when it is
// active — draft/completed/archived joins would create memberships that never
// surface on the active-only reviewer home (dead/invisible rows).

export function isCampaignJoinable(status: string): boolean {
  return status === "active";
}
