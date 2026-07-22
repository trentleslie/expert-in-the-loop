import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { getAuth, clerkClient } from "@clerk/express";
import multer from "multer";
import { parse } from "csv-parse/sync";
import {
  EXPORT_FORMATS,
  isExportFormat,
  buildExportRows,
  serializeExport,
  exportContentType,
  exportFilename,
} from "./exportSerializer";
import { storage } from "./storage";
import { requireAuth, requireAdmin } from "./auth";
import { requireCampaignAccess, requireCampaignOwner } from "./campaignAccess";
import { resolveMigrationEmail } from "./authMigration";
import { isCampaignJoinable } from "./campaignMembership";
import { insertCampaignSchema, insertVoteSchema, updateCampaignDetailsSchema, type InsertPair, type Campaign } from "@shared/schema";
import { RESOLUTION_LAYER_VALUES, campaignConfigSchema } from "@shared/campaignConfig";
import { z } from "zod";

const upload = multer({ storage: multer.memoryStorage() });

// Global admins are superusers over every campaign (per the admin-superuser
// ledger decision): they see all campaigns and bypass the per-campaign guard.
function isAdminReq(req: Request): boolean {
  return (getAuth(req).sessionClaims as Record<string, unknown>)?.role === "admin";
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // ==================== AUTH ROUTES ====================

  // Get current user (find-or-create on first call)
  // Uses requireAuth to enforce domain whitelist before creating local records
  app.get("/api/auth/me", requireAuth, async (req, res) => {
    const auth = getAuth(req);
    const userId = auth.userId!; // guaranteed by requireAuth

    try {
      // Find by Clerk userId first, then fall back to email lookup
      // (handles migration from Google OAuth IDs to Clerk IDs)
      let user = await storage.getUser(userId);
      if (!user) {
        const clerkUser = await clerkClient.users.getUser(userId);
        const resolved = resolveMigrationEmail(clerkUser);
        if (!resolved.ok) {
          // An unverified or missing primary email must not match-and-migrate an
          // existing local row (account takeover) nor create one under a synthetic
          // address. Treat as unauthenticated. (Cutover guard — Unit 1b.)
          return res.status(403).json({ message: "A verified email address is required." });
        }
        const email = resolved.email;

        // Check if user exists with this email but a different (old) ID
        const existingByEmail = await storage.getUserByEmail(email);
        if (existingByEmail) {
          // Migrate: update the old ID to the new Clerk ID
          await storage.updateUserId(existingByEmail.id, userId);
          user = await storage.getUser(userId);
        } else {
          user = await storage.createUser({
            id: userId,
            email,
            displayName:
              clerkUser.fullName ||
              clerkUser.firstName ||
              email.split("@")[0],
            role: ((clerkUser.publicMetadata as Record<string, unknown>)?.role as "reviewer" | "admin") || "reviewer",
          });
        }
      }

      // Reconcile the Clerk session-token `role` claim with the authoritative DB
      // role on EVERY login. requireAdmin reads `sessionClaims.role` (not the DB),
      // so this is what actually gates admin. Comparing the claim we already have
      // (no extra Clerk fetch) makes the cutover role-grant **self-healing**: if a
      // prior sync failed, the next login retries because the token still lacks
      // the claim. Isolated in its own try/catch so a transient Clerk API error
      // can't 500 the auth check or block the user from getting their account
      // (the worst case is they retry on their next login). Not bound to the
      // once-per-user migrate branch, so a single failed write is never permanent.
      const claimRole = (auth.sessionClaims as Record<string, unknown> | undefined)?.role;
      if (user && user.role && claimRole !== user.role) {
        try {
          await clerkClient.users.updateUserMetadata(userId, {
            publicMetadata: { role: user.role },
          });
        } catch (syncError) {
          console.error("[auth] Failed to sync role to Clerk (will retry next login):", syncError);
        }
      }

      return res.json({ user });
    } catch (error) {
      console.error("Error fetching user:", error);
      return res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // ==================== CAMPAIGN ROUTES ====================

  // List campaigns
  app.get("/api/campaigns", requireAuth, async (req, res) => {
    try {
      // Reviewers see only campaigns they own or participate in, each tagged with
      // their per-campaign role (viewerRole). Admins see all (unfiltered).
      if (isAdminReq(req)) {
        const campaigns = await storage.getCampaignsWithStats();
        return res.json(campaigns);
      }
      const campaigns = await storage.listCampaignsForUser(getAuth(req).userId!);
      res.json(campaigns);
    } catch (error) {
      console.error("Error fetching campaigns:", error);
      res.status(500).json({ message: "Failed to fetch campaigns" });
    }
  });

  // Get distinct campaign types for autocomplete
  app.get("/api/campaign-types", requireAuth, async (req, res) => {
    try {
      // Restrict distinct types to the reviewer's visible campaigns (admins: all).
      const visibleIds = isAdminReq(req)
        ? undefined
        : await storage.getVisibleCampaignIds(getAuth(req).userId!);
      const types = await storage.getDistinctCampaignTypes(visibleIds);
      res.json(types);
    } catch (error) {
      console.error("Error fetching campaign types:", error);
      res.status(500).json({ message: "Failed to fetch campaign types" });
    }
  });

  // Get single campaign
  app.get("/api/campaigns/:id", requireAuth, requireCampaignAccess("param"), async (req, res) => {
    try {
      const campaign = await storage.getCampaign(req.params.id);
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }
      res.json(campaign);
    } catch (error) {
      console.error("Error fetching campaign:", error);
      res.status(500).json({ message: "Failed to fetch campaign" });
    }
  });

  // Create campaign (admin only)
  app.post("/api/campaigns", requireAdmin, async (req, res) => {
    try {
      const validatedData = insertCampaignSchema.parse({
        ...req.body,
        createdBy: getAuth(req).userId!,
        status: "draft",
      });
      const campaign = await storage.createCampaign(validatedData);
      res.status(201).json(campaign);
    } catch (error) {
      console.error("Error creating campaign:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid campaign data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create campaign" });
    }
  });

  // Update campaign status (admin only)
  // Two mutually-exclusive update paths share this route, dispatched on body
  // shape: a status change (lifecycle) OR a detail edit (name/description/
  // instructions). The status guard must live INSIDE its branch — a details-only
  // body has no `status`, so validating it unconditionally would 400 every edit.
  app.patch("/api/campaigns/:id", requireAdmin, async (req, res) => {
    try {
      // 404 on a missing campaign so a no-op UPDATE can't masquerade as success
      // (mirrors PUT /:id/config). Covers both the status and details branches.
      const existing = await storage.getCampaign(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      const body = (req.body ?? {}) as Record<string, unknown>;
      const hasStatus = body.status !== undefined;
      const hasDetails = ["name", "description", "instructions"].some((k) => body[k] !== undefined);

      if (hasStatus && hasDetails) {
        return res.status(400).json({ message: "Update either status or details, not both" });
      }

      if (hasStatus) {
        const { status } = body as { status: unknown };
        if (typeof status !== "string" || !["draft", "active", "completed", "archived"].includes(status)) {
          return res.status(400).json({ message: "Invalid status" });
        }
        await storage.updateCampaignStatus(req.params.id, status as Campaign["status"]);
        return res.json({ success: true });
      }

      if (hasDetails) {
        const parsed = updateCampaignDetailsSchema.safeParse(body);
        if (!parsed.success) {
          return res.status(400).json({ message: "Invalid campaign details", errors: parsed.error.flatten() });
        }
        await storage.updateCampaignDetails(req.params.id, parsed.data);
        return res.json({ success: true });
      }

      return res.status(400).json({ message: "No updatable fields provided" });
    } catch (error) {
      console.error("Error updating campaign:", error);
      res.status(500).json({ message: "Failed to update campaign" });
    }
  });

  // Update campaign config (admin only). Validates against the shared contract,
  // persists, and — if the campaign already has votes — bulk-recomputes evidence
  // status under the new config (consensus thresholds / scoring mode may change
  // every pair's tier). Returns the recompute outcome so the UI can show
  // running -> done/failed.
  app.put("/api/campaigns/:id/config", requireAdmin, async (req, res) => {
    try {
      const campaign = await storage.getCampaign(req.params.id);
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      const parsed = campaignConfigSchema.safeParse(req.body?.config);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid campaign config", errors: parsed.error.errors });
      }

      await storage.updateCampaignConfig(req.params.id, parsed.data);

      // Only campaigns with existing votes need a recompute — a config edit on a
      // not-yet-reviewed campaign just takes effect on future votes.
      const progress = await storage.getCampaignProgress(req.params.id);
      if (progress.reviewed > 0) {
        const result = await storage.recomputeCampaignEvidenceStatus(req.params.id);
        return res.json({ success: true, recomputed: result.recomputed, recomputeStatus: result.status });
      }

      return res.json({ success: true, recomputed: 0, recomputeStatus: "idle" });
    } catch (error) {
      console.error("Error updating campaign config:", error);
      // recomputeCampaignEvidenceStatus already persisted recomputeStatus='failed'.
      res.status(500).json({ message: "Failed to update campaign config", recomputeStatus: "failed" });
    }
  });

  // Upload pairs to campaign (admin only)
  // Accepts two formats:
  //   1. multipart/form-data with a "file" field (CSV or JSON file upload)
  //   2. application/json body with a "pairs" array (pre-mapped data from the column mapping wizard)
  app.post("/api/campaigns/:id/pairs", requireAdmin, upload.single("file"), async (req, res) => {
    try {
      const campaignId = req.params.id;
      const campaign = await storage.getCampaign(campaignId);

      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      let pairsData: InsertPair[] = [];

      if (req.is("application/json")) {
        // ── JSON body path (pre-mapped pairs from column mapping wizard) ──────
        const { pairs: rawPairs } = req.body;

        if (!Array.isArray(rawPairs) || rawPairs.length === 0) {
          return res.status(400).json({ message: "Request body must contain a non-empty 'pairs' array" });
        }

        // Validate each pair has the required fields. pairType is now free-text
        // (defaults to the campaign type) — no fixed allowlist.
        const invalidPairs: number[] = [];

        pairsData = rawPairs.map((p: any, idx: number) => {
          const pairType = p.pair_type || p.pairType || campaign.campaignType;
          const sourceText = p.source_text || p.sourceText;
          const sourceDataset = p.source_dataset || p.sourceDataset;
          const sourceId = p.source_id || p.sourceId;
          const targetText = p.target_text || p.targetText;
          const targetDataset = p.target_dataset || p.targetDataset;
          const targetId = p.target_id || p.targetId;

          if (!sourceText || !sourceId || !targetText || !targetId) {
            invalidPairs.push(idx);
          }

          return {
            campaignId,
            pairType,
            resolutionLayer: p.resolution_layer || p.resolutionLayer || "unspecified",
            sourceText: sourceText || "",
            sourceDataset: sourceDataset || "Unknown",
            sourceId: sourceId || "",
            sourceMetadata: p.source_metadata || p.sourceMetadata || null,
            targetText: targetText || "",
            targetDataset: targetDataset || "Unknown",
            targetId: targetId || "",
            targetMetadata: p.target_metadata || p.targetMetadata || null,
            llmConfidence: p.llm_confidence !== undefined
              ? parseFloat(p.llm_confidence)
              : (p.llmConfidence !== undefined ? parseFloat(p.llmConfidence) : null),
            llmModel: p.llm_model || p.llmModel || null,
            llmReasoning: p.llm_reasoning || p.llmReasoning || null,
          };
        });

        if (invalidPairs.length > 0) {
          return res.status(400).json({
            message: `${invalidPairs.length} pair(s) are missing required fields (sourceText, sourceId, targetText, targetId).`,
            invalidIndices: invalidPairs,
          });
        }
      } else {
        // ── File upload path (existing behavior) ────────────────────────────
        if (!req.file) {
          return res.status(400).json({ message: "No file uploaded" });
        }

        const fileContent = req.file.buffer.toString("utf-8");

        if (req.file.mimetype === "application/json" || req.file.originalname.endsWith(".json")) {
          // Parse JSON file
          const parsed = JSON.parse(fileContent);
          const rawPairs = parsed.pairs || parsed;

          pairsData = rawPairs.map((p: any) => ({
            campaignId,
            pairType: p.pair_type || p.pairType || campaign.campaignType,
            resolutionLayer: p.resolution_layer || p.resolutionLayer || "unspecified",
            sourceText: p.source_text || p.sourceText,
            sourceDataset: p.source_dataset || p.sourceDataset,
            sourceId: p.source_id || p.sourceId,
            sourceMetadata: p.source_metadata || p.sourceMetadata || null,
            targetText: p.target_text || p.targetText,
            targetDataset: p.target_dataset || p.targetDataset,
            targetId: p.target_id || p.targetId,
            targetMetadata: p.target_metadata || p.targetMetadata || null,
            llmConfidence: p.llm_confidence !== undefined ? parseFloat(p.llm_confidence) : (p.llmConfidence !== undefined ? p.llmConfidence : null),
            llmModel: p.llm_model || p.llmModel || null,
            llmReasoning: p.llm_reasoning || p.llmReasoning || null,
          }));
        } else {
          // Parse CSV file
          const records = parse(fileContent, {
            columns: true,
            skip_empty_lines: true,
            trim: true,
          });

          // Standard field columns are mapped explicitly; ALL other columns are
          // preserved verbatim in sourceMetadata (no LOINC-specific fallbacks or
          // hardcoded metadata keys). For precise source/target metadata splits,
          // use the column-mapping wizard (JSON path above). Stored as raw
          // strings — downstream renders them text-only (never as HTML).
          const STANDARD_COLS = new Set([
            "source_text", "source_dataset", "source_id", "source_metadata",
            "target_text", "target_dataset", "target_id", "target_metadata",
            "pair_type", "resolution_layer", "llm_confidence", "confidence_score",
            "llm_model", "llm_reasoning",
          ]);

          // A malformed JSON cell in a metadata column must yield a descriptive
          // 400 (which row + column), not throw synchronously inside .map() and
          // surface as an opaque 500. Collect failures and reject as a batch —
          // mirrors the resolution_layer validation just below.
          // `row` is 1-based (row 1 = first data row after the header) so the
          // error maps directly to the user's file without mental arithmetic.
          const metadataErrors: { row: number; column: string }[] = [];
          const parseMetadataCell = (raw: string, column: string, index: number): any => {
            try {
              return JSON.parse(raw);
            } catch {
              metadataErrors.push({ row: index + 1, column });
              return null;
            }
          };

          pairsData = records.map((row: any, index: number) => {
            const extraMetadata: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(row)) {
              if (!STANDARD_COLS.has(key) && value !== "" && value != null) {
                extraMetadata[key] = value;
              }
            }

            return {
              campaignId,
              pairType: row.pair_type || campaign.campaignType,
              resolutionLayer: row.resolution_layer || "unspecified",
              sourceText: row.source_text,
              sourceDataset: row.source_dataset || "Unknown",
              sourceId: row.source_id,
              sourceMetadata: row.source_metadata
                ? parseMetadataCell(row.source_metadata, "source_metadata", index)
                : (Object.keys(extraMetadata).length > 0 ? extraMetadata : null),
              targetText: row.target_text,
              targetDataset: row.target_dataset || "Unknown",
              targetId: row.target_id,
              targetMetadata: row.target_metadata
                ? parseMetadataCell(row.target_metadata, "target_metadata", index)
                : null,
              llmConfidence: row.llm_confidence
                ? parseFloat(row.llm_confidence)
                : (row.confidence_score ? parseFloat(row.confidence_score) : null),
              llmModel: row.llm_model || null,
              llmReasoning: row.llm_reasoning || null,
            };
          });

          if (metadataErrors.length > 0) {
            return res.status(400).json({
              message: "Invalid JSON in metadata column(s); each cell must contain valid JSON.",
              errors: metadataErrors,
            });
          }
        }
      }

      // ── Provenance validation ────────────────────────────────────────────
      // resolutionLayer flows to downstream exports — reject unknown values
      // rather than silently mislabeling provenance.
      const invalidLayers = pairsData
        .map((p, i) => ({ i, rl: p.resolutionLayer }))
        .filter((x) => x.rl != null && !(RESOLUTION_LAYER_VALUES as readonly string[]).includes(x.rl));
      if (invalidLayers.length > 0) {
        return res.status(400).json({
          message: `Invalid resolution_layer value(s). Allowed: ${RESOLUTION_LAYER_VALUES.join(", ")}.`,
          invalidIndices: invalidLayers.map((x) => x.i),
        });
      }

      // ── Same-source filtering (config-driven, opt-in per campaign) ─────────
      // Only filters when the campaign enables sourcePrefixFilter, using its
      // configured prefixes (no hardcoded arivale_/il10k_/ukbb_ list).
      const config = await storage.getCampaignConfig(campaignId);
      let sameSourcePairs: string[] = [];
      let crossSourcePairsData = pairsData;
      if (config.import.sourcePrefixFilter) {
        const prefixes = config.import.sourcePrefixes ?? [];
        const prefixOf = (id: string): string | null =>
          prefixes.find((pre) => id.startsWith(pre)) ?? null;
        crossSourcePairsData = pairsData.filter((p) => {
          const sp = prefixOf(p.sourceId);
          const tp = prefixOf(p.targetId);
          if (sp !== null && sp === tp) {
            sameSourcePairs.push(`${p.sourceId} ↔ ${p.targetId}`);
            return false;
          }
          return true;
        });
      }

      // ── Duplicate detection ───────────────────────────────────────────────
      // Fetch all existing source_id + target_id combinations for this campaign
      const existingPairsRaw = await storage.getPairIdentifiers(campaignId);
      const existingSet = new Set(
        existingPairsRaw.map((p) => `${p.sourceId}::${p.targetId}`)
      );

      const duplicates: string[] = [];
      const uniquePairsData = crossSourcePairsData.filter((p) => {
        const key = `${p.sourceId}::${p.targetId}`;
        if (existingSet.has(key)) {
          duplicates.push(key);
          return false;
        }
        return true;
      });

      if (uniquePairsData.length === 0) {
        const reasons: string[] = [];
        if (duplicates.length > 0) reasons.push(`${duplicates.length} duplicate(s)`);
        if (sameSourcePairs.length > 0) reasons.push(`${sameSourcePairs.length} same-source pair(s)`);
        return res.status(409).json({
          message: `No new pairs were imported. Skipped: ${reasons.join(", ")}.`,
          duplicateCount: duplicates.length,
          sameSourceCount: sameSourcePairs.length,
          importedCount: 0,
        });
      }

      const count = await storage.createPairs(uniquePairsData);

      const skippedMessages: string[] = [];
      if (duplicates.length > 0) skippedMessages.push(`${duplicates.length} duplicate(s)`);
      if (sameSourcePairs.length > 0) skippedMessages.push(`${sameSourcePairs.length} same-source pair(s)`);

      res.json({
        count,
        message: `Successfully imported ${count} pair(s)${skippedMessages.length > 0 ? `. Skipped: ${skippedMessages.join(", ")}.` : "."}`,
        importedCount: count,
        duplicateCount: duplicates.length,
        sameSourceCount: sameSourcePairs.length,
        skippedDuplicates: duplicates.length > 0 ? duplicates : undefined,
        skippedSameSource: sameSourcePairs.length > 0 ? sameSourcePairs : undefined,
      });
    } catch (error) {
      console.error("Error uploading pairs:", error);
      res.status(500).json({ message: "Failed to upload pairs" });
    }
  });

  // Get next pair for review
  app.get("/api/campaigns/:id/next-pair", requireAuth, requireCampaignAccess("param"), async (req, res) => {
    try {
      const campaignId = req.params.id;
      const userId = getAuth(req).userId!;

      // Archived/completed campaigns are not open for voting (clean-slate
      // isolation). storage.getNextPairForUser also guards, but return an
      // explicit signal rather than a silent empty queue.
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) return res.status(404).json({ message: "Campaign not found" });
      if (campaign.status === "archived" || campaign.status === "completed") {
        return res.status(403).json({ message: "Campaign is not open for voting" });
      }

      const pair = await storage.getNextPairForUser(campaignId, userId);
      const progress = await storage.getCampaignProgress(campaignId);

      res.json({
        pair,
        progress,
        sessionStats: {
          reviewCount: 0, // Client tracks this
          streak: 0,
        },
      });
    } catch (error) {
      console.error("Error getting next pair:", error);
      res.status(500).json({ message: "Failed to get next pair" });
    }
  });

  // Get campaign results with pagination and filters (admin only)
  app.get("/api/campaigns/:id/results", requireAdmin, async (req, res) => {
    try {
      const campaignId = req.params.id;
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const search = req.query.search as string | undefined;
      const consensus = req.query.consensus as "match" | "no_match" | "disagreement" | "unreviewed" | undefined;
      const minVotes = req.query.minVotes ? parseInt(req.query.minVotes as string) : undefined;
      const maxVotes = req.query.maxVotes ? parseInt(req.query.maxVotes as string) : undefined;

      const results = await storage.getCampaignResults(campaignId, {
        page,
        limit,
        search,
        consensus: consensus || null,
        minVotes,
        maxVotes,
      });

      res.json(results);
    } catch (error) {
      console.error("Error fetching campaign results:", error);
      res.status(500).json({ message: "Failed to fetch campaign results" });
    }
  });

  // Get pair details with all votes (admin only)
  app.get("/api/pairs/:id/details", requireAdmin, async (req, res) => {
    try {
      const pairId = req.params.id;
      const details = await storage.getPairDetails(pairId);

      if (!details) {
        return res.status(404).json({ message: "Pair not found" });
      }

      res.json(details);
    } catch (error) {
      console.error("Error fetching pair details:", error);
      res.status(500).json({ message: "Failed to fetch pair details" });
    }
  });

  // Export campaign results (admin only)
  app.get("/api/campaigns/:id/export", requireAdmin, async (req, res) => {
    try {
      const campaignId = req.params.id;
      const campaign = await storage.getCampaign(campaignId);
      
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      // Format is an allowlisted query param; default csv. All formats export
      // the WHOLE campaign (on-screen filters are not applied to exports) and
      // share one serializer so field coverage can't drift across formats.
      const format = req.query.format ?? "csv";
      if (!isExportFormat(format)) {
        return res
          .status(400)
          .json({ message: `Invalid format. Allowed: ${EXPORT_FORMATS.join(", ")}.` });
      }

      const exportData = await storage.getCampaignExportData(campaignId);
      const rows = buildExportRows(exportData);
      const body = serializeExport(rows, format, {
        campaignName: campaign.name,
        exportedAt: new Date().toISOString(),
      });

      res.setHeader("Content-Type", exportContentType(format));
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${exportFilename(campaign.name, format)}"`,
      );
      res.send(body);
    } catch (error) {
      console.error("Error exporting campaign:", error);
      res.status(500).json({ message: "Failed to export campaign" });
    }
  });

  // ==================== PAIR/VOTE ROUTES ====================

  // Shared vote-cast handler. POST = first vote, PATCH = edit/correction; both
  // create-or-supersede atomically (storage.castVote). No more 409-on-duplicate —
  // a repeat vote supersedes the prior one. Reaching this with an existing vote
  // only happens via the vote-history "edit" action (the review queue never
  // re-serves a decided pair); supersession is therefore audit-only.
  async function castVoteHandler(req: Request, res: Response) {
    try {
      const pairId = req.params.id;
      const userId = getAuth(req).userId!; // server-authoritative — never trust the body

      const pair = await storage.getPair(pairId);
      if (!pair) return res.status(404).json({ message: "Pair not found" });

      const campaign = await storage.getCampaign(pair.campaignId);
      if (!campaign) return res.status(404).json({ message: "Campaign not found" });
      if (campaign.status === "archived" || campaign.status === "completed") {
        return res.status(403).json({ message: "Campaign is not open for voting" });
      }

      // Scoring mode is campaign-level — derive from config, don't trust req.body.
      const config = await storage.getCampaignConfig(pair.campaignId);
      const mode = config.scoring.mode;

      // Reject votes whose shape mismatches the campaign's scoring mode.
      if (mode === "binary" && (req.body.scoreBinary == null || req.body.scoreNumeric != null)) {
        return res.status(400).json({ message: "This campaign uses binary scoring; provide scoreBinary only." });
      }
      if (mode === "numeric" && (req.body.scoreNumeric == null || req.body.scoreBinary != null)) {
        return res.status(400).json({ message: "This campaign uses numeric scoring; provide scoreNumeric only." });
      }

      const voteData = insertVoteSchema.parse({
        pairId,
        userId,
        scoreBinary: mode === "binary" ? req.body.scoreBinary : null,
        scoreNumeric: mode === "numeric" ? req.body.scoreNumeric : null,
        scoringMode: mode,
        expertSelectedCode: req.body.expertSelectedCode ?? null,
        reviewerNotes: req.body.reviewerNotes ?? null,
      });

      const { vote, evidenceStatus } = await storage.castVote(pairId, userId, voteData, config);
      await storage.updateUserLastActive(userId);

      res.status(201).json({ ...vote, evidenceStatus });
    } catch (error) {
      console.error("Error casting vote:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid vote data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to submit vote" });
    }
  }

  // Submit vote for a pair
  app.post("/api/pairs/:id/vote", requireAuth, requireCampaignAccess("pairParam"), castVoteHandler);

  // Skip a pair
  app.post("/api/pairs/:id/skip", requireAuth, requireCampaignAccess("pairParam"), async (req, res) => {
    try {
      const pairId = req.params.id;
      const userId = getAuth(req).userId!;

      // Handler-level backstop: skipPair is a bare onConflictDoNothing insert with
      // no existence check of its own, so re-resolve the pair→campaign here as
      // defense-in-depth against a middleware-wiring mistake (unlike castVote,
      // which re-fetches the campaign).
      const campaignId = await storage.getCampaignIdForPair(pairId);
      if (!campaignId) return res.status(404).json({ message: "Pair not found" });

      await storage.skipPair(pairId, userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error skipping pair:", error);
      res.status(500).json({ message: "Failed to skip pair" });
    }
  });

  // ==================== CAMPAIGN MEMBERSHIP (reviewer focus) ====================

  // Join a campaign via its shareable link (intentional-only association).
  app.post("/api/campaigns/:id/join", requireAuth, async (req, res) => {
    try {
      const campaignId = req.params.id;
      const userId = getAuth(req).userId!;
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) return res.status(404).json({ message: "Campaign not found" });
      // Only active campaigns are joinable — draft/completed/archived joins would
      // create memberships that never surface on the active-only reviewer home.
      if (!isCampaignJoinable(campaign.status)) {
        return res.status(403).json({ message: "Campaign is not open for joining" });
      }
      await storage.joinCampaign(campaignId, userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error joining campaign:", error);
      res.status(500).json({ message: "Failed to join campaign" });
    }
  });

  // Roster of who has joined a campaign (membership-derived — includes
  // joined-but-not-yet-voted reviewers, unlike the vote-derived analytics tab).
  // Relaxed from requireAdmin → requireCampaignOwner so a non-admin owner can
  // open the Members dialog. Each row carries `role` (owner | participant).
  app.get("/api/campaigns/:id/roster", requireAuth, requireCampaignOwner("param"), async (req, res) => {
    try {
      const roster = await storage.getCampaignRoster(req.params.id);
      res.json(roster);
    } catch (error) {
      console.error("Error fetching campaign roster:", error);
      res.status(500).json({ message: "Failed to fetch campaign roster" });
    }
  });

  // Add a co-owner (promote an existing member or insert an owner row). Owner or
  // admin only. add-by-email is deferred — this takes a resolved { userId }.
  app.post("/api/campaigns/:id/owners", requireAuth, requireCampaignOwner("param"), async (req, res) => {
    try {
      const { userId } = req.body ?? {};
      if (!userId || typeof userId !== "string") {
        return res.status(400).json({ message: "userId is required" });
      }
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });
      await storage.addCampaignOwner(req.params.id, userId);
      res.status(201).json({ success: true });
    } catch (error) {
      console.error("Error adding campaign owner:", error);
      res.status(500).json({ message: "Failed to add campaign owner" });
    }
  });

  // Remove a member from the roster. Owner or admin only. Refuses removing the
  // last owner (≥1-owner invariant).
  app.delete("/api/campaigns/:id/participants/:userId", requireAuth, requireCampaignOwner("param"), async (req, res) => {
    try {
      const result = await storage.removeCampaignParticipant(req.params.id, req.params.userId);
      if (!result.removed) {
        if (result.reason === "last_owner") {
          return res.status(409).json({ message: "Cannot remove the last owner of a campaign" });
        }
        return res.status(404).json({ message: "Membership not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing campaign participant:", error);
      res.status(500).json({ message: "Failed to remove campaign participant" });
    }
  });

  // ==================== USER ROUTES ====================

  // Get all users (admin only)
  app.get("/api/users", requireAdmin, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // Update user role (admin only) — updates Clerk publicMetadata (authoritative) and local DB (cache)
  app.patch("/api/users/:id/role", requireAdmin, async (req, res) => {
    try {
      const { role } = req.body;
      if (!["reviewer", "admin"].includes(role)) {
        return res.status(400).json({ message: "Invalid role" });
      }
      // Update Clerk publicMetadata (authoritative source for role).
      // updateUserMetadata MERGES; updateUser({publicMetadata}) would replace
      // the whole object and drop any other keys.
      await clerkClient.users.updateUserMetadata(req.params.id, {
        publicMetadata: { role },
      });
      // Update local DB (cache/audit)
      await storage.updateUserRole(req.params.id, role);
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating user role:", error);
      res.status(500).json({ message: "Failed to update user role" });
    }
  });

  // Get current user stats
  app.get("/api/users/me/stats", requireAuth, async (req, res) => {
    try {
      const userId = getAuth(req).userId!;
      const stats = await storage.getUserStats(userId);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching user stats:", error);
      res.status(500).json({ message: "Failed to fetch user stats" });
    }
  });

  // Get the campaign ids the current user has joined (drives the joined-first
  // reviewer home). Named under /api/users/me/* so it can't be shadowed by
  // GET /api/campaigns/:id (which would match :id="mine").
  app.get("/api/users/me/campaigns", requireAuth, async (req, res) => {
    try {
      const userId = getAuth(req).userId!;
      const ids = await storage.getJoinedCampaignIds(userId);
      res.json(ids);
    } catch (error) {
      console.error("Error fetching joined campaigns:", error);
      res.status(500).json({ message: "Failed to fetch joined campaigns" });
    }
  });

  // Get current user's vote history
  app.get("/api/users/me/votes", requireAuth, async (req, res) => {
    try {
      const userId = getAuth(req).userId!;
      const userVotes = await storage.getUserVotes(userId);
      res.json(userVotes);
    } catch (error) {
      console.error("Error fetching user votes:", error);
      res.status(500).json({ message: "Failed to fetch vote history" });
    }
  });

  // Edit a vote (correction from vote-history) — supersedes the prior vote via
  // the same atomic create-or-supersede path as POST.
  app.patch("/api/pairs/:id/vote", requireAuth, requireCampaignAccess("pairParam"), castVoteHandler);

  // ==================== ADMIN ROUTES ====================

  // Get admin dashboard stats
  app.get("/api/admin/stats", requireAdmin, async (req, res) => {
    try {
      const stats = await storage.getAdminStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching admin stats:", error);
      res.status(500).json({ message: "Failed to fetch admin stats" });
    }
  });

  // Domain management is now handled via Clerk Dashboard allowlist
  // and the ALLOWED_EMAIL_DOMAINS environment variable.
  // The /api/admin/domains routes have been removed.

  // ==================== INTER-RATER RELIABILITY ====================

  // Get Krippendorff's Alpha for a campaign
  app.get("/api/campaigns/:id/alpha", requireAuth, requireCampaignAccess("param"), async (req, res) => {
    try {
      const result = await storage.calculateKrippendorffAlpha(req.params.id);
      res.json(result);
    } catch (error) {
      console.error("Error calculating alpha:", error);
      res.status(500).json({ message: "Failed to calculate alpha" });
    }
  });

  // ==================== IMPORT TEMPLATES ====================

  // Get all import templates
  app.get("/api/import-templates", requireAdmin, async (req, res) => {
    try {
      const templates = await storage.getImportTemplates();
      res.json(templates);
    } catch (error) {
      console.error("Error fetching templates:", error);
      res.status(500).json({ message: "Failed to fetch templates" });
    }
  });

  // Create import template
  app.post("/api/import-templates", requireAdmin, async (req, res) => {
    try {
      const { name, description, columnMappings } = req.body;
      if (!name || !columnMappings) {
        return res.status(400).json({ message: "Name and column mappings are required" });
      }
      const template = await storage.createImportTemplate({
        name,
        description: description || null,
        columnMappings,
        createdBy: getAuth(req).userId!,
      });
      res.status(201).json(template);
    } catch (error) {
      console.error("Error creating template:", error);
      res.status(500).json({ message: "Failed to create template" });
    }
  });

  // Get single import template by id
  app.get("/api/import-templates/:id", requireAdmin, async (req, res) => {
    try {
      const template = await storage.getImportTemplate(req.params.id);
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }
      res.json(template);
    } catch (error) {
      console.error("Error fetching template:", error);
      res.status(500).json({ message: "Failed to fetch template" });
    }
  });

  // Delete import template
  app.delete("/api/import-templates/:id", requireAdmin, async (req, res) => {
    try {
      await storage.deleteImportTemplate(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting template:", error);
      res.status(500).json({ message: "Failed to delete template" });
    }
  });

  // ==================== ANALYTICS ROUTES ====================
  // Analytics routes are accessible to all authenticated users (reviewers and admins)

  // Campaign analytics summary (all campaigns)
  app.get("/api/analytics/campaigns", requireAuth, async (req, res) => {
    try {
      // Cross-campaign aggregate — restrict to the reviewer's visible set so it
      // cannot leak other campaigns' totals (admins: unfiltered).
      const visibleIds = isAdminReq(req)
        ? undefined
        : await storage.getVisibleCampaignIds(getAuth(req).userId!);
      const summary = await storage.getCampaignAnalyticsSummary(visibleIds);
      res.json(summary);
    } catch (error) {
      console.error("Error fetching analytics summary:", error);
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  // Vote distribution for a campaign
  app.get("/api/analytics/campaigns/:id/votes", requireAuth, requireCampaignAccess("param"), async (req, res) => {
    try {
      const distribution = await storage.getVoteDistribution(req.params.id);
      res.json(distribution);
    } catch (error) {
      console.error("Error fetching vote distribution:", error);
      res.status(500).json({ message: "Failed to fetch vote distribution" });
    }
  });

  // Reviewer stats for a campaign
  app.get("/api/analytics/campaigns/:id/reviewers", requireAuth, requireCampaignAccess("param"), async (req, res) => {
    try {
      const stats = await storage.getReviewerStats(req.params.id);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching reviewer stats:", error);
      res.status(500).json({ message: "Failed to fetch reviewer stats" });
    }
  });

  // High disagreement pairs for a campaign
  app.get("/api/analytics/campaigns/:id/disagreements", requireAuth, requireCampaignAccess("param"), async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const pairs = await storage.getHighDisagreementPairs(req.params.id, limit);
      const byConfidence = await storage.getDisagreementByConfidence(req.params.id);
      res.json({ pairs, byConfidence });
    } catch (error) {
      console.error("Error fetching disagreement data:", error);
      res.status(500).json({ message: "Failed to fetch disagreement data" });
    }
  });

  // Skip analysis for a campaign
  app.get("/api/analytics/campaigns/:id/skips", requireAuth, requireCampaignAccess("param"), async (req, res) => {
    try {
      const analysis = await storage.getSkipAnalysis(req.params.id);
      res.json(analysis);
    } catch (error) {
      console.error("Error fetching skip analysis:", error);
      res.status(500).json({ message: "Failed to fetch skip analysis" });
    }
  });

  // Votes over time (optional campaignId query param). campaignId arrives as a
  // query param (not a route param), so the access check is inline rather than
  // via the requireCampaignAccess middleware:
  //   - ?campaignId present → the caller must be a member of that campaign (or
  //     admin); non-members get 404 (enumeration hardening).
  //   - absent → restrict the all-campaign aggregate to the caller's visible set.
  app.get("/api/analytics/votes-over-time", requireAuth, async (req, res) => {
    try {
      const campaignId = req.query.campaignId as string | undefined;
      const admin = isAdminReq(req);
      const userId = getAuth(req).userId!;

      if (campaignId) {
        if (!admin) {
          const membership = await storage.getCampaignMembership(campaignId, userId);
          if (!membership) return res.status(404).json({ message: "Not found" });
        }
        const data = await storage.getVotesOverTime(campaignId);
        return res.json(data);
      }

      const visibleIds = admin ? undefined : await storage.getVisibleCampaignIds(userId);
      const data = await storage.getVotesOverTime(undefined, visibleIds);
      res.json(data);
    } catch (error) {
      console.error("Error fetching votes over time:", error);
      res.status(500).json({ message: "Failed to fetch votes over time" });
    }
  });

  // Execute read-only SQL query (admin only)
  app.post("/api/database/query", requireAdmin, async (req, res) => {
    try {
      const { sql } = req.body;
      if (!sql || typeof sql !== "string") {
        return res.status(400).json({ message: "SQL query is required" });
      }

      const normalizedSql = sql.trim().replace(/\s+/g, " ").toUpperCase();
      
      const forbiddenPatterns = [
        /^INSERT\b/i, /^UPDATE\b/i, /^DELETE\b/i, /^DROP\b/i, /^ALTER\b/i,
        /^CREATE\b/i, /^TRUNCATE\b/i, /^GRANT\b/i, /^REVOKE\b/i, 
        /^EXECUTE\b/i, /^EXEC\b/i, /^CALL\b/i, /^SET\b/i, /^VACUUM\b/i,
        /^COPY\b/i, /^LOCK\b/i, /^REINDEX\b/i, /^CLUSTER\b/i,
        /;\s*INSERT\b/i, /;\s*UPDATE\b/i, /;\s*DELETE\b/i, /;\s*DROP\b/i,
        /;\s*ALTER\b/i, /;\s*CREATE\b/i, /;\s*TRUNCATE\b/i,
      ];
      
      const containsForbidden = forbiddenPatterns.some(pattern => pattern.test(sql));
      
      if (containsForbidden) {
        return res.status(403).json({ message: "Only SELECT queries are allowed. Mutating operations are blocked." });
      }
      
      if (!normalizedSql.startsWith("SELECT ") && !normalizedSql.startsWith("WITH ") && !normalizedSql.startsWith("EXPLAIN ")) {
        return res.status(403).json({ message: "Only SELECT, WITH, or EXPLAIN queries are allowed" });
      }

      const startTime = Date.now();
      const result = await storage.executeReadOnlyQuery(sql);
      const executionTime = Date.now() - startTime;

      res.json({
        columns: result.columns,
        rows: result.rows,
        rowCount: result.rows.length,
        executionTime,
      });
    } catch (error: any) {
      console.error("Query error:", error);
      res.status(400).json({ message: error.message || "Query execution failed" });
    }
  });

  return httpServer;
}
