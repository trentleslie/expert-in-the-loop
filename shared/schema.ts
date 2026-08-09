import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, uuid, boolean, integer, real, jsonb, pgEnum, unique, type AnyPgColumn } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { campaignConfigSchema, type CampaignConfig, type EvidenceStatus } from "./campaignConfig";

// Enums
export const userRoleEnum = pgEnum("user_role", ["reviewer", "admin"]);
export const campaignStatusEnum = pgEnum("campaign_status", ["draft", "active", "completed", "archived"]);
// NOTE: pairType is now free-text (the pair_type pgEnum was dropped in
// migration-001). scoring_mode stays an enum (multi_criteria deferred — #5).
// "partition" (reviewer groups a pair's members into concepts) added via
// `ALTER TYPE scoring_mode ADD VALUE 'partition'` — see migrations/0002_*.
export const scoringModeEnum = pgEnum("scoring_mode", ["binary", "numeric", "partition"]);
export const binaryScoreEnum = pgEnum("binary_score", ["match", "no_match", "unsure"]);
// Campaign membership role — access control (owner/participant). One row per
// (campaign,user); `role` distinguishes management rights from plain access.
export const membershipRoleEnum = pgEnum("membership_role", ["owner", "participant"]);

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
  // Per-campaign configuration (scoring, consensus, display, import). Nullable:
  // getCampaignConfig() falls back to DEFAULT_CAMPAIGN_CONFIG when null. New
  // campaigns are created with an explicit config at the application layer; a
  // JS-object constant is NOT a SQL default, so db:push leaves existing rows null.
  config: jsonb("config").$type<CampaignConfig>(),
  // Bulk evidence-status recompute lifecycle (admin config edits). A stale
  // 'running' on startup is reconciled to 'failed' and offered for retry.
  recomputeStatus: text("recompute_status").notNull().default("idle"),
  createdBy: varchar("created_by", { length: 255 }).references(() => users.id, { onUpdate: "cascade" }).notNull(),
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
  // Free-text (was the pair_type enum; generalized in migration-001).
  pairType: text("pair_type").notNull(),
  // Evidence tier — recomputed from active votes on every vote/supersession.
  evidenceStatus: text("evidence_status").notNull().default("unreviewed"),
  // Provenance of how this pair was produced (validated against RESOLUTION_LAYER_VALUES).
  resolutionLayer: text("resolution_layer").notNull().default("unspecified"),

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
  userId: varchar("user_id", { length: 255 }).references(() => users.id, { onUpdate: "cascade" }).notNull(),
  scoreBinary: binaryScoreEnum("score_binary"),
  scoreNumeric: integer("score_numeric"),
  // Partition vote: the reviewer's grouping of the pair's members into distinct concepts.
  // `groups` is a partition of the member ids (each member in exactly one group). Exactly one
  // group ⇒ coherent; more than one ⇒ an over-merge. NULL for binary/numeric votes. Additive
  // jsonb column (db:push-safe).
  scorePartition: jsonb("score_partition").$type<{ groups: string[][] }>(),
  scoringMode: scoringModeEnum("scoring_mode").notNull(),
  // Expert selection: alternative LOINC code selected when reviewer disagrees
  expertSelectedCode: text("expert_selected_code"),
  // Reviewer notes/reasoning for their decision
  reviewerNotes: text("reviewer_notes"),
  // Vote supersession chain: when a reviewer edits a prior vote, a new row is
  // inserted and the old row's supersededBy points to it with isActive=false.
  // Vote *content* is immutable; only these two flags are mutated on the old row.
  supersededBy: uuid("superseded_by").references((): AnyPgColumn => votes.id),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").$onUpdate(() => new Date()),
});
// NOTE: the (pairId, userId) UNIQUE constraint was dropped in migration-001 to
// allow multiple vote rows per reviewer/pair (supersession chain). Do not re-add it.

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
  addedBy: varchar("added_by", { length: 255 }).references(() => users.id, { onUpdate: "cascade" }),
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
  userId: varchar("user_id", { length: 255 }).references(() => users.id, { onUpdate: "cascade" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  uniqueSkip: unique().on(table.pairId, table.userId),
}));

// Import Templates Table (stores column mapping configurations for CSV import)
export const importTemplates = pgTable("import_templates", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  createdBy: varchar("created_by", { length: 255 }).references(() => users.id, { onUpdate: "cascade" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  columnMappings: jsonb("column_mappings").notNull(),
});

export const importTemplatesRelations = relations(importTemplates, ({ one }) => ({
  creator: one(users, {
    fields: [importTemplates.createdBy],
    references: [users.id],
  }),
}));

// Campaign Memberships Table — reviewer↔campaign association that is now
// **access control** (owner/participant), reversing the old "collective pool"
// posture. A reviewer becomes a `participant` by joining (share link) or by
// having voted (backfill); the campaign creator (and any added co-owner) is an
// `owner` with membership-management rights. One row per (campaign,user); `role`
// distinguishes access from management. Membership = visibility: reviewers only
// see campaigns they own or participate in.
export const campaignMemberships = pgTable("campaign_memberships", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: uuid("campaign_id").references(() => campaigns.id).notNull(),
  // onUpdate:cascade so the Clerk auth ID-migration (UPDATE users SET id=<clerkId>)
  // re-points membership rows instead of FK-violating — like every users.id FK.
  userId: varchar("user_id", { length: 255 }).references(() => users.id, { onUpdate: "cascade" }).notNull(),
  // Access-control role. Defaulted so db:push backfills existing rows as
  // 'participant'; the SQL backfill then promotes creators to 'owner'.
  role: membershipRoleEnum("role").notNull().default("participant"),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
}, (table) => ({
  uniqueMembership: unique().on(table.campaignId, table.userId),
}));

export const campaignMembershipsRelations = relations(campaignMemberships, ({ one }) => ({
  campaign: one(campaigns, {
    fields: [campaignMemberships.campaignId],
    references: [campaigns.id],
  }),
  user: one(users, {
    fields: [campaignMemberships.userId],
    references: [users.id],
  }),
}));

// Insert Schemas
export const insertUserSchema = createInsertSchema(users).omit({
  createdAt: true,
  lastActive: true,
});

export const insertCampaignSchema = createInsertSchema(campaigns, {
  // Use the real config contract (drizzle-zod widens jsonb $type to a loose
  // shape, dropping the discriminated-union literal on scoring.mode).
  config: campaignConfigSchema.nullish(),
}).omit({
  id: true,
  createdAt: true,
  recomputeStatus: true, // server-managed lifecycle field
});

// Editable campaign detail fields (admin "Configure Campaign" dialog). Distinct
// from insertCampaignSchema: only name/description/instructions are touched here,
// never campaignType/config/status/createdBy (those are create-only or have their
// own endpoints). Empty/whitespace-only description/instructions coerce to null so
// the review page never renders a blank instructions panel.
// Omitted (undefined) fields stay undefined so the storage layer can leave them
// untouched (true partial update); an explicit "" / whitespace clears the field
// to null. name is always required on a details edit.
export const updateCampaignDetailsSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(255),
  description: z
    .string()
    .max(5000)
    .nullish()
    .transform((v) => (v === undefined ? undefined : v && v.trim() !== "" ? v : null)),
  instructions: z
    .string()
    .max(2000)
    .nullish()
    .transform((v) => (v === undefined ? undefined : v && v.trim() !== "" ? v : null)),
});
export type UpdateCampaignDetails = z.infer<typeof updateCampaignDetailsSchema>;

export const insertPairSchema = createInsertSchema(pairs).omit({
  id: true,
  createdAt: true,
});

export const insertVoteSchema = createInsertSchema(votes, {
  // drizzle-zod widens a $type'd jsonb column to a loose shape; pin it to the real
  // partition contract so InsertVote.scorePartition matches the column's { groups: string[][] }.
  scorePartition: z.object({ groups: z.array(z.array(z.string())) }).nullish(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  supersededBy: true, // server-managed supersession chain
  isActive: true,
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

export const insertCampaignMembershipSchema = createInsertSchema(campaignMemberships).omit({
  id: true,
  joinedAt: true,
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

export type CampaignMembership = typeof campaignMemberships.$inferSelect;
export type InsertCampaignMembership = z.infer<typeof insertCampaignMembershipSchema>;
export type MembershipRole = (typeof membershipRoleEnum.enumValues)[number];

// Extended types for frontend
export type CampaignWithStats = Campaign & {
  totalPairs: number;
  reviewedPairs: number;
  creator?: User;
  // Evidence-tier breakdown for progress reporting (R12). Optional so callers
  // that don't compute it stay valid.
  evidenceTiers?: Record<EvidenceStatus, number>;
  // The caller's per-campaign membership role, present on the reviewer-home
  // list (Axis-1's listCampaignsForUser tags each visible campaign). Optional /
  // nullable: admin-facing lists (getCampaignsWithStats) omit it, and an admin
  // viewing a campaign they don't belong to carries null. The client folds
  // isAdmin → implicit owner regardless (CS1).
  viewerRole?: MembershipRole | null;
};

export type PairWithVotes = Pair & {
  voteCount: number;
  positiveRate: number | null;
  // Count of active (non-superseded) votes vs total rows in the chain.
  activeVoteCount?: number;
  totalVoteCount?: number;
};

export type UserStats = {
  totalVotes: number;
  votesPerCampaign: { campaignId: string; campaignName: string; voteCount: number }[];
  agreementRate: number | null;
  recentActivity: { date: string; count: number }[];
};
