import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, uuid, boolean, integer, real, jsonb, pgEnum, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Enums
export const userRoleEnum = pgEnum("user_role", ["reviewer", "admin"]);
export const campaignStatusEnum = pgEnum("campaign_status", ["draft", "active", "completed", "archived"]);
export const pairTypeEnum = pgEnum("pair_type", ["questionnaire_match", "loinc_mapping"]);
export const scoringModeEnum = pgEnum("scoring_mode", ["binary", "numeric"]);
export const binaryScoreEnum = pgEnum("binary_score", ["match", "no_match", "unsure"]);

// Users Table
export const users = pgTable("users", {
  id: varchar("id", { length: 255 }).primaryKey(), // Google 'sub' claim
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  role: userRoleEnum("role").notNull().default("reviewer"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastActive: timestamp("last_active").defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  votes: many(votes),
  campaigns: many(campaigns),
}));

// Campaigns Table
export const campaigns = pgTable("campaigns", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  campaignType: text("campaign_type").notNull(),
  // Reviewer instructions shown on the review page
  instructions: text("instructions"),
  createdBy: varchar("created_by", { length: 255 }).references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  status: campaignStatusEnum("status").notNull().default("draft"),
});

export const campaignsRelations = relations(campaigns, ({ one, many }) => ({
  creator: one(users, {
    fields: [campaigns.createdBy],
    references: [users.id],
  }),
  pairs: many(pairs),
}));

// Pairs Table
export const pairs = pgTable("pairs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: uuid("campaign_id").references(() => campaigns.id).notNull(),
  pairType: pairTypeEnum("pair_type").notNull(),
  
  // Source item
  sourceText: text("source_text").notNull(),
  sourceDataset: text("source_dataset").notNull(),
  sourceId: text("source_id").notNull(),
  sourceMetadata: jsonb("source_metadata"),
  
  // Target item
  targetText: text("target_text").notNull(),
  targetDataset: text("target_dataset").notNull(),
  targetId: text("target_id").notNull(),
  targetMetadata: jsonb("target_metadata"),
  
  // LLM matching metadata
  llmConfidence: real("llm_confidence"),
  llmModel: text("llm_model"),
  llmReasoning: text("llm_reasoning"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const pairsRelations = relations(pairs, ({ one, many }) => ({
  campaign: one(campaigns, {
    fields: [pairs.campaignId],
    references: [campaigns.id],
  }),
  votes: many(votes),
}));

// Votes Table
export const votes = pgTable("votes", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  pairId: uuid("pair_id").references(() => pairs.id).notNull(),
  userId: varchar("user_id", { length: 255 }).references(() => users.id).notNull(),
  scoreBinary: binaryScoreEnum("score_binary"),
  scoreNumeric: integer("score_numeric"),
  scoringMode: scoringModeEnum("scoring_mode").notNull(),
  // Expert selection: alternative LOINC code selected when reviewer disagrees
  expertSelectedCode: text("expert_selected_code"),
  // Reviewer notes/reasoning for their decision
  reviewerNotes: text("reviewer_notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").$onUpdate(() => new Date()),
}, (table) => ({
  uniqueUserPair: unique().on(table.pairId, table.userId),
}));

export const votesRelations = relations(votes, ({ one }) => ({
  pair: one(pairs, {
    fields: [votes.pairId],
    references: [pairs.id],
  }),
  user: one(users, {
    fields: [votes.userId],
    references: [users.id],
  }),
}));

// Allowed Domains Table
export const allowedDomains = pgTable("allowed_domains", {
  domain: text("domain").primaryKey(),
  addedAt: timestamp("added_at").defaultNow().notNull(),
  addedBy: varchar("added_by", { length: 255 }).references(() => users.id),
});

export const allowedDomainsRelations = relations(allowedDomains, ({ one }) => ({
  addedByUser: one(users, {
    fields: [allowedDomains.addedBy],
    references: [users.id],
  }),
}));

// Skipped Pairs Table (tracks pairs user has skipped)
export const skippedPairs = pgTable("skipped_pairs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  pairId: uuid("pair_id").references(() => pairs.id).notNull(),
  userId: varchar("user_id", { length: 255 }).references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  uniqueSkip: unique().on(table.pairId, table.userId),
}));

// Import Templates Table (stores column mapping configurations for CSV import)
export const importTemplates = pgTable("import_templates", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  createdBy: varchar("created_by", { length: 255 }).references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  columnMappings: jsonb("column_mappings").notNull(),
});

export const importTemplatesRelations = relations(importTemplates, ({ one }) => ({
  creator: one(users, {
    fields: [importTemplates.createdBy],
    references: [users.id],
  }),
}));

// Insert Schemas
export const insertUserSchema = createInsertSchema(users).omit({
  createdAt: true,
  lastActive: true,
});

export const insertCampaignSchema = createInsertSchema(campaigns).omit({
  id: true,
  createdAt: true,
});

export const insertPairSchema = createInsertSchema(pairs).omit({
  id: true,
  createdAt: true,
});

export const insertVoteSchema = createInsertSchema(votes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAllowedDomainSchema = createInsertSchema(allowedDomains).omit({
  addedAt: true,
});

export const insertSkippedPairSchema = createInsertSchema(skippedPairs).omit({
  id: true,
  createdAt: true,
});

export const insertImportTemplateSchema = createInsertSchema(importTemplates).omit({
  id: true,
  createdAt: true,
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Campaign = typeof campaigns.$inferSelect;
export type InsertCampaign = z.infer<typeof insertCampaignSchema>;

export type Pair = typeof pairs.$inferSelect;
export type InsertPair = z.infer<typeof insertPairSchema>;

export type Vote = typeof votes.$inferSelect;
export type InsertVote = z.infer<typeof insertVoteSchema>;

export type AllowedDomain = typeof allowedDomains.$inferSelect;
export type InsertAllowedDomain = z.infer<typeof insertAllowedDomainSchema>;

export type SkippedPair = typeof skippedPairs.$inferSelect;
export type InsertSkippedPair = z.infer<typeof insertSkippedPairSchema>;

export type ImportTemplate = typeof importTemplates.$inferSelect;
export type InsertImportTemplate = z.infer<typeof insertImportTemplateSchema>;

// Extended types for frontend
export type CampaignWithStats = Campaign & {
  totalPairs: number;
  reviewedPairs: number;
  creator?: User;
};

export type PairWithVotes = Pair & {
  voteCount: number;
  positiveRate: number | null;
};

export type UserStats = {
  totalVotes: number;
  votesPerCampaign: { campaignId: string; campaignName: string; voteCount: number }[];
  agreementRate: number | null;
  recentActivity: { date: string; count: number }[];
};
