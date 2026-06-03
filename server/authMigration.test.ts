import { describe, it, expect } from "vitest";
import { resolveMigrationEmail } from "./authMigration";

describe("resolveMigrationEmail", () => {
  it("accepts a verified primary email", () => {
    const r = resolveMigrationEmail({
      primaryEmailAddress: {
        emailAddress: "Trent.Leslie@phenomehealth.org",
        verification: { status: "verified" },
      },
    });
    expect(r).toEqual({ ok: true, email: "Trent.Leslie@phenomehealth.org" });
  });

  it("rejects an unverified primary email (no account takeover at cutover)", () => {
    const r = resolveMigrationEmail({
      primaryEmailAddress: {
        emailAddress: "attacker@phenomehealth.org",
        verification: { status: "unverified" },
      },
    });
    expect(r).toEqual({ ok: false, reason: "email_not_verified" });
  });

  it("rejects when verification is missing entirely", () => {
    const r = resolveMigrationEmail({
      primaryEmailAddress: { emailAddress: "x@phenomehealth.org" },
    });
    expect(r).toEqual({ ok: false, reason: "email_not_verified" });
  });

  it("rejects when there is no primary email (no unknown@unknown.com fallback)", () => {
    expect(resolveMigrationEmail({ primaryEmailAddress: null })).toEqual({
      ok: false,
      reason: "no_primary_email",
    });
    expect(resolveMigrationEmail({})).toEqual({ ok: false, reason: "no_primary_email" });
    expect(resolveMigrationEmail(null)).toEqual({ ok: false, reason: "no_primary_email" });
  });
});
