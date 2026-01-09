import type { Express } from "express";
import { createServer, type Server } from "http";
import passport from "passport";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import { storage } from "./storage";
import { setupAuth, requireAuth, requireAdmin } from "./auth";
import { insertCampaignSchema, insertVoteSchema, type InsertPair } from "@shared/schema";
import { z } from "zod";

const upload = multer({ storage: multer.memoryStorage() });

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Setup authentication
  setupAuth(app);

  // ==================== AUTH ROUTES ====================

  // Google OAuth - initiate login
  app.get("/api/auth/google", (req, res, next) => {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return res.redirect("/login?error=oauth_not_configured");
    }
    passport.authenticate("google", { scope: ["profile", "email"] })(req, res, next);
  });

  // Google OAuth callback
  app.get(
    "/api/auth/google/callback",
    (req, res, next) => {
      passport.authenticate("google", (err: Error | null, user: Express.User | false, info: { message?: string }) => {
        if (err) {
          console.error("Google OAuth error:", err);
          return res.redirect("/login?error=auth_failed");
        }
        if (!user) {
          const errorType = info?.message === "domain_not_allowed" ? "domain_not_allowed" : "auth_failed";
          return res.redirect(`/login?error=${errorType}`);
        }
        req.logIn(user, (loginErr) => {
          if (loginErr) {
            console.error("Login error:", loginErr);
            return res.redirect("/login?error=auth_failed");
          }
          return res.redirect("/");
        });
      })(req, res, next);
    }
  );

  // Logout
  app.post("/api/auth/logout", (req, res) => {
    req.logout((err) => {
      if (err) {
        return res.status(500).json({ message: "Logout failed" });
      }
      req.session.destroy((destroyErr) => {
        res.clearCookie("connect.sid");
        res.json({ success: true });
      });
    });
  });

  // Get current user
  app.get("/api/auth/me", (req, res) => {
    if (req.isAuthenticated() && req.user) {
      return res.json({ user: req.user });
    }
    return res.status(401).json({ message: "Not authenticated" });
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
        createdBy: req.user!.id,
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
  app.post("/api/campaigns/:id/pairs", requireAdmin, upload.single("file"), async (req, res) => {
    try {
      const campaignId = req.params.id;
      const campaign = await storage.getCampaign(campaignId);
      
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const fileContent = req.file.buffer.toString("utf-8");
      let pairsData: InsertPair[] = [];

      if (req.file.mimetype === "application/json" || req.file.originalname.endsWith(".json")) {
        // Parse JSON
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
        // Parse CSV
        const records = parse(fileContent, {
          columns: true,
          skip_empty_lines: true,
          trim: true,
        });

        pairsData = records.map((row: any) => ({
          campaignId,
          pairType: row.pair_type || campaign.campaignType,
          sourceText: row.source_text,
          sourceDataset: row.source_dataset,
          sourceId: row.source_id,
          sourceMetadata: row.source_metadata ? JSON.parse(row.source_metadata) : null,
          targetText: row.target_text,
          targetDataset: row.target_dataset,
          targetId: row.target_id,
          targetMetadata: row.target_metadata ? JSON.parse(row.target_metadata) : null,
          llmConfidence: row.llm_confidence ? parseFloat(row.llm_confidence) : null,
          llmModel: row.llm_model || null,
          llmReasoning: row.llm_reasoning || null,
        }));
      }

      const count = await storage.createPairs(pairsData);
      res.json({ count, message: `Successfully imported ${count} pairs` });
    } catch (error) {
      console.error("Error uploading pairs:", error);
      res.status(500).json({ message: "Failed to upload pairs" });
    }
  });

  // Get next pair for review
  app.get("/api/campaigns/:id/next-pair", requireAuth, async (req, res) => {
    try {
      const campaignId = req.params.id;
      const userId = req.user!.id;

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
        positive_votes: item.votes.filter((v) => v.scoreBinary === true).length,
        negative_votes: item.votes.filter((v) => v.scoreBinary === false).length,
        positive_rate: item.positiveRate !== null ? item.positiveRate.toFixed(3) : "",
        consensus: item.positiveRate !== null ? (item.positiveRate > 0.5 ? "match" : "no_match") : "",
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
      const userId = req.user!.id;

      const voteData = insertVoteSchema.parse({
        pairId,
        userId,
        scoreBinary: req.body.scoreBinary,
        scoreNumeric: req.body.scoreNumeric || null,
        scoringMode: req.body.scoringMode || "binary",
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
      const userId = req.user!.id;

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

  // Update user role (admin only)
  app.patch("/api/users/:id/role", requireAdmin, async (req, res) => {
    try {
      const { role } = req.body;
      if (!["reviewer", "admin"].includes(role)) {
        return res.status(400).json({ message: "Invalid role" });
      }
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
      const userId = req.user!.id;
      const stats = await storage.getUserStats(userId);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching user stats:", error);
      res.status(500).json({ message: "Failed to fetch user stats" });
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

  // Get allowed domains
  app.get("/api/admin/domains", requireAdmin, async (req, res) => {
    try {
      const domains = await storage.getAllowedDomains();
      res.json(domains);
    } catch (error) {
      console.error("Error fetching domains:", error);
      res.status(500).json({ message: "Failed to fetch domains" });
    }
  });

  // Add allowed domain
  app.post("/api/admin/domains", requireAdmin, async (req, res) => {
    try {
      const { domain } = req.body;
      if (!domain || typeof domain !== "string") {
        return res.status(400).json({ message: "Domain is required" });
      }
      const created = await storage.addAllowedDomain({
        domain: domain.toLowerCase(),
        addedBy: req.user!.id,
      });
      res.status(201).json(created);
    } catch (error: any) {
      console.error("Error adding domain:", error);
      if (error.code === "23505") {
        return res.status(409).json({ message: "Domain already exists" });
      }
      res.status(500).json({ message: "Failed to add domain" });
    }
  });

  // Remove allowed domain
  app.delete("/api/admin/domains/:domain", requireAdmin, async (req, res) => {
    try {
      await storage.removeAllowedDomain(req.params.domain);
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing domain:", error);
      res.status(500).json({ message: "Failed to remove domain" });
    }
  });

  return httpServer;
}
