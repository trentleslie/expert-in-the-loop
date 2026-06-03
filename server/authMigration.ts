// Pure helper for the `/api/auth/me` find-or-create path. Extracted so the
// security-sensitive decision (which Clerk users may claim/create a local
// account during the Google-OAuth -> Clerk cutover) is unit-testable without
// standing up Clerk + Express + a DB.

/** Minimal structural shape of a Clerk backend `User` we depend on. */
export type ClerkPrimaryEmail = {
  primaryEmailAddress?:
    | {
        emailAddress?: string | null;
        verification?: { status?: string | null } | null;
      }
    | null;
} | null | undefined;

export type MigrationEmail =
  | { ok: true; email: string }
  | { ok: false; reason: "no_primary_email" | "email_not_verified" };

/**
 * Decide whether a Clerk user's primary email may be used to find-or-create a
 * local account. Requires a present, **verified** primary email — an unverified
 * (or absent) email must NOT be trusted to match-and-migrate an existing local
 * row, or every prod user hits this path cold at cutover and an unverified email
 * could take over an existing account. Replaces the old
 * `email || "unknown@unknown.com"` fallback, which let any second email-less
 * user collide onto the first.
 */
export function resolveMigrationEmail(clerkUser: ClerkPrimaryEmail): MigrationEmail {
  const email = clerkUser?.primaryEmailAddress?.emailAddress;
  if (!email) return { ok: false, reason: "no_primary_email" };
  if (clerkUser?.primaryEmailAddress?.verification?.status !== "verified") {
    return { ok: false, reason: "email_not_verified" };
  }
  return { ok: true, email };
}
