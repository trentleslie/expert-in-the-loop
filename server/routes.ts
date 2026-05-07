import type { Express } from "express";
import { createServer, type Server } from "http";
import { getAuth, clerkClient } from "@clerk/express";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import { storage } from "./storage";
import { requireAuth, requireAdmin } from "./auth";
import { insertCampaignSchema, insertVoteSchema, type InsertPair } from "@shared/schema";
import { z } from "zod";

const upload = multer({ storage: multer.memoryStorage() });

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // ==================== AUTH ROUTES ====================

  // Get current user (find-or-create on first call)
  app.get("/api/auth/me", async (req, res) => {
    const auth = getAuth(req);
    if (!auth?.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    try {
      // Find or create user in local database
      let user = await storage.getUser(auth.userId);
      if (!user) {
        const clerkUser = await clerkClient.users.getUser(auth.userId);
        const email =
          clerkUser.primaryEmailAddress?.emailAddress || "unknown@unknown.com";
        user = await storage.createUser({
          id: auth.userId,
          email,
          displayName:
            clerkUser.fullName ||
            clerkUser.firstName ||
            email.split("@")[0],
          role: ((clerkUser.publicMetadata as Record<string, unknown>)?.role as "reviewer" | "admin") || "reviewer",
        });
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
      const campaigns = await storage.getCampaignsWithStats();
      res.json(campaigns);
    } catch (error) {
      console.error("Error fetching campaigns:", error);
      res.status(500).json({ message: "Failed to fetch campaigns" });
    }
  });

  // Get distinct campaign types for autocomplete
  app.get("/api/campaign-types", requireAuth, async (req, res) => {
    try {
      const types = await storage.getDistinctCampaignTypes();
      res.json(types);
    } catch (error) {
      console.error("Error fetching campaign types:", error);
      res.status(500).json({ message: "Failed to fetch campaign types" });
    }
  });

  // Get single campaign
  app.get("/api/campaigns/:id", requireAuth, async (req, res) => {
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
  app.patch("/api/campaigns/:id", requireAdmin, async (req, res) => {
    try {
      const { status } = req.body;
      if (!["draft", "active", "completed", "archived"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      await storage.updateCampaignStatus(req.params.id, status);
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating campaign:", error);
      res.status(500).json({ message: "Failed to update campaign" });
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

        // Validate each pair has the required fields
        const validPairTypes = ["questionnaire_match", "loinc_mapping"];
        const invalidPairs: number[] = [];

        pairsData = rawPairs.map((p: any, idx: number) => {
          const pairType = p.pair_type || p.pairType || campaign.campaignType;
          const sourceText = p.source_text || p.sourceText;
          const sourceDataset = p.source_dataset || p.sourceDataset;
          const sourceId = p.source_id || p.sourceId;
          const targetText = p.target_text || p.targetText;
          const targetDataset = p.target_dataset || p.targetDataset;
          const targetId = p.target_id || p.targetId;

          if (!sourceText || !sourceId || !targetText || !targetId || !validPairTypes.includes(pairType)) {
            invalidPairs.push(idx);
          }

          return {
            campaignId,
            pairType: pairType as "questionnaire_match" | "loinc_mapping",
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
            message: `${invalidPairs.length} pair(s) are missing required fields (sourceText, sourceId, targetText, targetId) or have an invalid pairType. Valid types: ${validPairTypes.join(", ")}`,
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

          pairsData = records.map((row: any) => {
            // Build metadata from extra columns
            const sourceMetadata: Record<string, unknown> = {};
            const targetMetadata: Record<string, unknown> = {};

            if (row.category) sourceMetadata.category = row.category;
            if (row.units) sourceMetadata.units = row.units;
            if (row.data_type) sourceMetadata.data_type = row.data_type;
            if (row.query_source) sourceMetadata.query_source = row.query_source;
            if (row.num_queries) sourceMetadata.num_queries = row.num_queries;
            if (row.top_5_loinc) targetMetadata.top_5_loinc = row.top_5_loinc;

            return {
              campaignId,
              pairType: row.pair_type || campaign.campaignType,
              // Support both standard names and Arivale/LOINC format
              sourceText: row.source_text || row.description,
              sourceDataset: row.source_dataset || row.cohort || "Unknown",
              sourceId: row.source_id || row.field_name,
              sourceMetadata: row.source_metadata
                ? JSON.parse(row.source_metadata)
                : (Object.keys(sourceMetadata).length > 0 ? sourceMetadata : null),
              targetText: row.target_text || row.loinc_name,
              targetDataset: row.target_dataset || (row.loinc_code ? "LOINC" : "Unknown"),
              targetId: row.target_id || row.loinc_code,
              targetMetadata: row.target_metadata
                ? JSON.parse(row.target_metadata)
                : (Object.keys(targetMetadata).length > 0 ? targetMetadata : null),
              llmConfidence: row.llm_confidence
                ? parseFloat(row.llm_confidence)
                : (row.confidence_score ? parseFloat(row.confidence_score) : null),
              llmModel: row.llm_model || null,
              llmReasoning: row.llm_reasoning || null,
            };
          });
        }
      }

      // ── Same-source pair detection ───────────────────────────────────────
      // Helper function to extract source prefix from question ID
      const getSourcePrefix = (id: string): string => {
        if (id.startsWith("arivale_")) return "arivale";
        if (id.startsWith("il10k_")) return "il10k";
        if (id.startsWith("ukbb_")) return "ukbb";
        return "unknown";
      };

      // Filter out same-source pairs (invalid for cross-source harmonization)
      const sameSourcePairs: string[] = [];
      const crossSourcePairsData = pairsData.filter((p) => {
        const sourcePrefix = getSourcePrefix(p.sourceId);
        const targetPrefix = getSourcePrefix(p.targetId);
        if (sourcePrefix !== "unknown" && sourcePrefix === targetPrefix) {
          sameSourcePairs.push(`${p.sourceId} ↔ ${p.targetId}`);
          return false;
        }
        return true;
      });

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
  app.get("/api/campaigns/:id/next-pair", requireAuth, async (req, res) => {
    try {
      const campaignId = req.params.id;
      const userId = getAuth(req).userId!;

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

      const exportData = await storage.getCampaignExportData(campaignId);

      const csvData = exportData.map((item) => ({
        pair_id: item.pair.id,
        source_text: item.pair.sourceText,
        source_dataset: item.pair.sourceDataset,
        source_id: item.pair.sourceId,
        target_text: item.pair.targetText,
        target_dataset: item.pair.targetDataset,
        target_id: item.pair.targetId,
        llm_confidence: item.pair.llmConfidence,
        llm_model: item.pair.llmModel,
        vote_count: item.votes.length,
        positive_votes: item.votes.filter((v) => v.scoreBinary === "match").length,
        negative_votes: item.votes.filter((v) => v.scoreBinary === "no_match").length,
        unsure_votes: item.votes.filter((v) => v.scoreBinary === "unsure").length,
        positive_rate: item.positiveRate !== null ? item.positiveRate.toFixed(3) : "",
        consensus: item.positiveRate !== null ? (item.positiveRate > 0.5 ? "match" : "no_match") : "",
        expert_selections: item.votes.filter(v => v.expertSelectedCode).map(v => v.expertSelectedCode).join("; "),
        reviewer_notes: item.votes.filter(v => v.reviewerNotes).map(v => v.reviewerNotes).join(" | "),
      }));

      const csv = stringify(csvData, { header: true });
      
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${campaign.name.replace(/\s+/g, "_")}_export.csv"`);
      res.send(csv);
    } catch (error) {
      console.error("Error exporting campaign:", error);
      res.status(500).json({ message: "Failed to export campaign" });
    }
  });

  // ==================== PAIR/VOTE ROUTES ====================

  // Submit vote for a pair
  app.post("/api/pairs/:id/vote", requireAuth, async (req, res) => {
    try {
      const pairId = req.params.id;
      const userId = getAuth(req).userId!;

      const voteData = insertVoteSchema.parse({
        pairId,
        userId,
        scoreBinary: req.body.scoreBinary,
        scoreNumeric: req.body.scoreNumeric || null,
        scoringMode: req.body.scoringMode || "binary",
        // Expert selection and notes
        expertSelectedCode: req.body.expertSelectedCode || null,
        reviewerNotes: req.body.reviewerNotes || null,
      });

      const vote = await storage.createVote(voteData);
      await storage.updateUserLastActive(userId);

      res.status(201).json(vote);
    } catch (error: any) {
      console.error("Error creating vote:", error);
      if (error.code === "23505") {
        return res.status(409).json({ message: "You have already voted on this pair" });
      }
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid vote data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to submit vote" });
    }
  });

  // Skip a pair
  app.post("/api/pairs/:id/skip", requireAuth, async (req, res) => {
    try {
      const pairId = req.params.id;
      const userId = getAuth(req).userId!;

      await storage.skipPair(pairId, userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error skipping pair:", error);
      res.status(500).json({ message: "Failed to skip pair" });
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
      // Update Clerk publicMetadata (authoritative source for role)
      await clerkClient.users.updateUser(req.params.id, {
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

  // Update a vote (for corrections)
  app.patch("/api/pairs/:id/vote", requireAuth, async (req, res) => {
    try {
      const pairId = req.params.id;
      const userId = getAuth(req).userId!;
      
      const { scoreBinary, scoreNumeric, scoringMode, expertSelectedCode, reviewerNotes } = req.body;
      
      const updated = await storage.updateVote(pairId, userId, {
        scoreBinary: scoreBinary !== undefined ? scoreBinary : undefined,
        scoreNumeric: scoreNumeric !== undefined ? scoreNumeric : undefined,
        scoringMode: scoringMode !== undefined ? scoringMode : undefined,
        expertSelectedCode: expertSelectedCode !== undefined ? expertSelectedCode : undefined,
        reviewerNotes: reviewerNotes !== undefined ? reviewerNotes : undefined,
      });
      
      if (!updated) {
        return res.status(404).json({ message: "Vote not found" });
      }
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating vote:", error);
      res.status(500).json({ message: "Failed to update vote" });
    }
  });

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
  app.get("/api/campaigns/:id/alpha", requireAuth, async (req, res) => {
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
      const summary = await storage.getCampaignAnalyticsSummary();
      res.json(summary);
    } catch (error) {
      console.error("Error fetching analytics summary:", error);
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  // Vote distribution for a campaign
  app.get("/api/analytics/campaigns/:id/votes", requireAuth, async (req, res) => {
    try {
      const distribution = await storage.getVoteDistribution(req.params.id);
      res.json(distribution);
    } catch (error) {
      console.error("Error fetching vote distribution:", error);
      res.status(500).json({ message: "Failed to fetch vote distribution" });
    }
  });

  // Reviewer stats for a campaign
  app.get("/api/analytics/campaigns/:id/reviewers", requireAuth, async (req, res) => {
    try {
      const stats = await storage.getReviewerStats(req.params.id);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching reviewer stats:", error);
      res.status(500).json({ message: "Failed to fetch reviewer stats" });
    }
  });

  // High disagreement pairs for a campaign
  app.get("/api/analytics/campaigns/:id/disagreements", requireAuth, async (req, res) => {
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
  app.get("/api/analytics/campaigns/:id/skips", requireAuth, async (req, res) => {
    try {
      const analysis = await storage.getSkipAnalysis(req.params.id);
      res.json(analysis);
    } catch (error) {
      console.error("Error fetching skip analysis:", error);
      res.status(500).json({ message: "Failed to fetch skip analysis" });
    }
  });

  // Votes over time (optional campaignId)
  app.get("/api/analytics/votes-over-time", requireAuth, async (req, res) => {
    try {
      const campaignId = req.query.campaignId as string | undefined;
      const data = await storage.getVotesOverTime(campaignId);
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
