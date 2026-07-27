import { describe, it, expect } from "vitest";
import { resolveAccess, canRemoveMember } from "./campaignAccess";

// Pure authorization logic for the campaign-access guards. Mirrors how
// isCampaignJoinable / resolveMigrationEmail are extracted for DB-free unit
// testing. Deny for a read must map to 404 (enumeration hardening), while an
// owner-management denial for a member maps to 403.

describe("resolveAccess — kind='access' (owner | participant | admin)", () => {
  it("passes an owner", () => {
    expect(resolveAccess({ role: "owner", isAdmin: false, kind: "access" })).toEqual({ ok: true });
  });
  it("passes a participant", () => {
    expect(resolveAccess({ role: "participant", isAdmin: false, kind: "access" })).toEqual({ ok: true });
  });
  it("passes an admin regardless of membership", () => {
    expect(resolveAccess({ role: null, isAdmin: true, kind: "access" })).toEqual({ ok: true });
  });
  it("denies a non-member with 404 (do not reveal existence)", () => {
    expect(resolveAccess({ role: null, isAdmin: false, kind: "access" })).toEqual({ ok: false, status: 404 });
  });
});

describe("resolveAccess — kind='owner' (owner | admin)", () => {
  it("passes an owner", () => {
    expect(resolveAccess({ role: "owner", isAdmin: false, kind: "owner" })).toEqual({ ok: true });
  });
  it("passes an admin", () => {
    expect(resolveAccess({ role: null, isAdmin: true, kind: "owner" })).toEqual({ ok: true });
  });
  it("denies a participant with 403 (member but may not manage)", () => {
    expect(resolveAccess({ role: "participant", isAdmin: false, kind: "owner" })).toEqual({ ok: false, status: 403 });
  });
  it("denies a non-member with 404 (do not reveal existence)", () => {
    expect(resolveAccess({ role: null, isAdmin: false, kind: "owner" })).toEqual({ ok: false, status: 404 });
  });
});

describe("canRemoveMember — last-owner invariant", () => {
  it("refuses removing the only owner", () => {
    expect(canRemoveMember({ targetRole: "owner", ownerCount: 1 })).toBe(false);
  });
  it("allows removing an owner when another owner remains", () => {
    expect(canRemoveMember({ targetRole: "owner", ownerCount: 2 })).toBe(true);
  });
  it("always allows removing a participant", () => {
    expect(canRemoveMember({ targetRole: "participant", ownerCount: 1 })).toBe(true);
  });
});
