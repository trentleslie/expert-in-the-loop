// Campaign-scoped authorization. A campaign's server endpoints are accessible
// only to that campaign's owners, participants, or a global admin — reversing the
// old "collective pool = not access control" posture.
//
// The pure decision (`resolveAccess`) is separated from the Express plumbing so
// it is unit-testable without Clerk/DB (mirrors isCampaignJoinable /
// resolveMigrationEmail). The middleware factory exists because a campaignId
// arrives three ways (route param, pair param, vote param).

import { getAuth } from "@clerk/express";
import type { Request, RequestHandler } from "express";
import { storage } from "./storage";
import type { MembershipRole } from "@shared/schema";

export type CampaignIdSource = "param" | "pairParam" | "voteParam";
export type AccessKind = "access" | "owner";
export type AccessDecision = { ok: true } | { ok: false; status: 403 | 404 };

/**
 * Pure authorization decision.
 * - admin  → always pass (superuser).
 * - access → owner|participant pass; non-member → 404 (don't reveal existence).
 * - owner  → owner passes; participant → 403 (member, may not manage);
 *            non-member → 404 (consistent with the read guard).
 */
export function resolveAccess(params: {
  role: MembershipRole | null;
  isAdmin: boolean;
  kind: AccessKind;
}): AccessDecision {
  const { role, isAdmin, kind } = params;
  if (isAdmin) return { ok: true };
  if (role === null) return { ok: false, status: 404 };
  if (kind === "access") return { ok: true }; // owner | participant
  // kind === "owner"
  if (role === "owner") return { ok: true };
  return { ok: false, status: 403 };
}

/**
 * Last-owner invariant: a campaign must always retain ≥1 owner. Refuses removing
 * the target when they are the sole owner. Participants are always removable.
 */
export function canRemoveMember(params: {
  targetRole: MembershipRole;
  ownerCount: number;
}): boolean {
  if (params.targetRole === "owner" && params.ownerCount <= 1) return false;
  return true;
}

/** Fields the guard stashes on the request for handlers that re-resolve. */
export interface CampaignScopedRequest extends Request {
  campaignId?: string;
  campaignRole?: MembershipRole | null;
}

async function resolveCampaignId(
  req: Request,
  source: CampaignIdSource,
): Promise<string | null> {
  switch (source) {
    case "param":
      return req.params.id ?? null;
    case "pairParam":
      return storage.getCampaignIdForPair(req.params.id);
    case "voteParam":
      return storage.getCampaignIdForVote(req.params.id);
  }
}

function makeGuard(source: CampaignIdSource, kind: AccessKind): RequestHandler {
  return async (req, res, next) => {
    try {
      const auth = getAuth(req);
      // Defense-in-depth: routes already carry requireAuth.
      if (!auth?.userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const isAdmin =
        (auth.sessionClaims as Record<string, unknown>)?.role === "admin";

      const campaignId = await resolveCampaignId(req, source);
      if (!campaignId) {
        return res.status(404).json({ message: "Not found" });
      }

      let role: MembershipRole | null = null;
      if (!isAdmin) {
        const membership = await storage.getCampaignMembership(campaignId, auth.userId);
        role = membership?.role ?? null;
      }

      const decision = resolveAccess({ role, isAdmin, kind });
      if (!decision.ok) {
        return res
          .status(decision.status)
          .json({ message: decision.status === 403 ? "Forbidden" : "Not found" });
      }

      // Stash so handlers that re-resolve (e.g. castVoteHandler) can avoid a
      // second lookup. Optional optimization; handlers still work without it.
      (req as CampaignScopedRequest).campaignId = campaignId;
      (req as CampaignScopedRequest).campaignRole = role;
      next();
    } catch (error) {
      console.error("Error enforcing campaign access:", error);
      res.status(500).json({ message: "Failed to authorize campaign access" });
    }
  };
}

/** owner | participant | admin may proceed. Non-member → 404. */
export const requireCampaignAccess = (
  source: CampaignIdSource = "param",
): RequestHandler => makeGuard(source, "access");

/** owner | admin may proceed. Participant → 403, non-member → 404. */
export const requireCampaignOwner = (
  source: CampaignIdSource = "param",
): RequestHandler => makeGuard(source, "owner");
