import { 
  users, campaigns, pairs, votes, allowedDomains, skippedPairs, importTemplates,
  type User, type InsertUser,
  type Campaign, type InsertCampaign,
  type Pair, type InsertPair,
  type Vote, type InsertVote,
  type AllowedDomain, type InsertAllowedDomain,
  type InsertSkippedPair,
  type ImportTemplate, type InsertImportTemplate,
  type CampaignWithStats, type UserStats
} from "@shared/schema";
import { db } from "./db";
import { eq, and, sql, desc, count, not, inArray, lt, gte, between } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserLastActive(id: string): Promise<void>;
  updateUserRole(id: string, role: "reviewer" | "admin"): Promise<void>;
  getAllUsers(): Promise<(User & { voteCount: number })[]>;
  getRecentUsers(limit: number): Promise<User[]>;
  
  // Campaigns
  getCampaign(id: string): Promise<Campaign | undefined>;
  getAllCampaigns(): Promise<CampaignWithStats[]>;
  getCampaignsWithStats(): Promise<CampaignWithStats[]>;
  createCampaign(campaign: InsertCampaign): Promise<Campaign>;
  updateCampaignStatus(id: string, status: Campaign["status"]): Promise<void>;
  
  // Pairs
  getPair(id: string): Promise<Pair | undefined>;
  createPairs(pairsData: InsertPair[]): Promise<number>;
  getNextPairForUser(campaignId: string, userId: string): Promise<Pair | null>;
  getPairsCount(campaignId: string): Promise<number>;
  getReviewedPairsCount(campaignId: string): Promise<number>;
  getCampaignProgress(campaignId: string): Promise<{ reviewed: number; total: number }>;
  
  // Votes
  createVote(vote: InsertVote): Promise<Vote>;
  getVotesByPair(pairId: string): Promise<Vote[]>;
  getUserVotes(userId: string): Promise<(Vote & { pair: Pair })[]>;
  updateVote(pairId: string, userId: string, updates: Partial<Pick<Vote, "scoreBinary" | "scoreNumeric" | "scoringMode" | "expertSelectedCode" | "reviewerNotes">>): Promise<Vote | null>;
  getUserVotesCount(userId: string): Promise<number>;
  getUserVotesPerCampaign(userId: string): Promise<{ campaignId: string; campaignName: string; voteCount: number }[]>;
  getUserRecentActivity(userId: string, days: number): Promise<{ date: string; count: number }[]>;
  getUserAgreementRate(userId: string): Promise<number | null>;
  getUserStats(userId: string): Promise<UserStats>;
  
  // Skipped pairs
  skipPair(pairId: string, userId: string): Promise<void>;
  
  // Allowed domains
  isDomainAllowed(domain: string): Promise<boolean>;
  getAllowedDomains(): Promise<AllowedDomain[]>;
  addAllowedDomain(domain: InsertAllowedDomain): Promise<AllowedDomain>;
  removeAllowedDomain(domain: string): Promise<void>;
  
  // Admin stats
  getAdminStats(): Promise<{
    totalUsers: number;
    totalCampaigns: number;
    totalVotes: number;
    activeCampaigns: number;
    recentUsers: User[];
  }>;
  
  // Export
  getCampaignExportData(campaignId: string): Promise<{
    pair: Pair;
    votes: Vote[];
    positiveRate: number | null;
  }[]>;
  
  // Results Browser (paginated)
  getCampaignResults(campaignId: string, options: {
    page: number;
    limit: number;
    search?: string;
    consensus?: "match" | "no_match" | "disagreement" | "unreviewed" | null;
    minVotes?: number;
    maxVotes?: number;
  }): Promise<{
    pairs: {
      pair: Pair;
      voteCount: number;
      positiveVotes: number;
      negativeVotes: number;
      skipCount: number;
      positiveRate: number | null;
    }[];
    total: number;
    page: number;
    totalPages: number;
  }>;
  
  // Get pair details with all votes
  getPairDetails(pairId: string): Promise<{
    pair: Pair;
    votes: (Vote & { user: Pick<User, "id" | "email" | "displayName"> })[];
    skipCount: number;
  } | null>;
  
  // Database explorer
  executeReadOnlyQuery(sql: string): Promise<{
    columns: string[];
    rows: Record<string, unknown>[];
  }>;
  
  // Import Templates
  getImportTemplates(): Promise<ImportTemplate[]>;
  getImportTemplate(id: string): Promise<ImportTemplate | undefined>;
  createImportTemplate(template: InsertImportTemplate): Promise<ImportTemplate>;
  deleteImportTemplate(id: string): Promise<void>;
  
  // Krippendorff's Alpha
  calculateKrippendorffAlpha(campaignId: string): Promise<{
    alpha: number | null;
    raterCount: number;
    pairCount: number;
    voteCount: number;
  }>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUserLastActive(id: string): Promise<void> {
    await db.update(users).set({ lastActive: new Date() }).where(eq(users.id, id));
  }

  async updateUserRole(id: string, role: "reviewer" | "admin"): Promise<void> {
    await db.update(users).set({ role }).where(eq(users.id, id));
  }

  async getAllUsers(): Promise<(User & { voteCount: number })[]> {
    const result = await db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        role: users.role,
        createdAt: users.createdAt,
        lastActive: users.lastActive,
        voteCount: sql<number>`COALESCE(COUNT(${votes.id}), 0)::int`,
      })
      .from(users)
      .leftJoin(votes, eq(users.id, votes.userId))
      .groupBy(users.id)
      .orderBy(desc(users.createdAt));
    
    return result;
  }

  async getRecentUsers(limit: number): Promise<User[]> {
    return db.select().from(users).orderBy(desc(users.createdAt)).limit(limit);
  }

  // Campaigns
  async getCampaign(id: string): Promise<Campaign | undefined> {
    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id));
    return campaign || undefined;
  }

  async getAllCampaigns(): Promise<CampaignWithStats[]> {
    return this.getCampaignsWithStats();
  }

  async getCampaignsWithStats(): Promise<CampaignWithStats[]> {
    const campaignList = await db.select().from(campaigns).orderBy(desc(campaigns.createdAt));
    
    const result: CampaignWithStats[] = [];
    for (const campaign of campaignList) {
      const progress = await this.getCampaignProgress(campaign.id);
      result.push({
        ...campaign,
        totalPairs: progress.total,
        reviewedPairs: progress.reviewed,
      });
    }
    return result;
  }

  async createCampaign(campaign: InsertCampaign): Promise<Campaign> {
    const [created] = await db.insert(campaigns).values(campaign).returning();
    return created;
  }

  async updateCampaignStatus(id: string, status: Campaign["status"]): Promise<void> {
    await db.update(campaigns).set({ status }).where(eq(campaigns.id, id));
  }

  // Pairs
  async getPair(id: string): Promise<Pair | undefined> {
    const [pair] = await db.select().from(pairs).where(eq(pairs.id, id));
    return pair || undefined;
  }

  async createPairs(pairsData: InsertPair[]): Promise<number> {
    if (pairsData.length === 0) return 0;
    const inserted = await db.insert(pairs).values(pairsData).returning();
    return inserted.length;
  }

  async getNextPairForUser(campaignId: string, userId: string): Promise<Pair | null> {
    // Get IDs of pairs user has already voted on or skipped
    const userVotes = await db
      .select({ pairId: votes.pairId })
      .from(votes)
      .where(eq(votes.userId, userId));
    
    const userSkips = await db
      .select({ pairId: skippedPairs.pairId })
      .from(skippedPairs)
      .where(eq(skippedPairs.userId, userId));
    
    const excludedIds = [...userVotes.map(v => v.pairId), ...userSkips.map(s => s.pairId)];

    // Priority 1: Pairs with 0 evaluations
    const pairsWithVoteCounts = await db
      .select({
        pair: pairs,
        voteCount: sql<number>`COALESCE(COUNT(${votes.id}), 0)::int`,
        positiveRate: sql<number>`
          CASE 
            WHEN COUNT(${votes.id}) > 0 
            THEN AVG(CASE WHEN ${votes.scoreBinary} = true THEN 1.0 ELSE 0.0 END)
            ELSE NULL 
          END
        `,
      })
      .from(pairs)
      .leftJoin(votes, eq(pairs.id, votes.pairId))
      .where(
        and(
          eq(pairs.campaignId, campaignId),
          excludedIds.length > 0 ? not(inArray(pairs.id, excludedIds)) : sql`true`
        )
      )
      .groupBy(pairs.id)
      .orderBy(
        sql`
          CASE 
            WHEN COUNT(${votes.id}) = 0 THEN 0
            WHEN ${pairs.llmConfidence} < 0.7 AND COUNT(${votes.id}) < 3 THEN 1
            WHEN COUNT(${votes.id}) > 0 AND 
                 AVG(CASE WHEN ${votes.scoreBinary} = true THEN 1.0 ELSE 0.0 END) BETWEEN 0.4 AND 0.6 THEN 2
            ELSE 3
          END,
          COUNT(${votes.id}),
          RANDOM()
        `
      )
      .limit(1);

    if (pairsWithVoteCounts.length === 0) {
      return null;
    }

    return pairsWithVoteCounts[0].pair;
  }

  async getPairsCount(campaignId: string): Promise<number> {
    const [result] = await db
      .select({ count: count() })
      .from(pairs)
      .where(eq(pairs.campaignId, campaignId));
    return result?.count || 0;
  }

  async getReviewedPairsCount(campaignId: string): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`COUNT(DISTINCT ${pairs.id})::int` })
      .from(pairs)
      .innerJoin(votes, eq(pairs.id, votes.pairId))
      .where(eq(pairs.campaignId, campaignId));
    return result?.count || 0;
  }

  async getCampaignProgress(campaignId: string): Promise<{ reviewed: number; total: number }> {
    const total = await this.getPairsCount(campaignId);
    const reviewed = await this.getReviewedPairsCount(campaignId);
    return { reviewed, total };
  }

  // Votes
  async createVote(vote: InsertVote): Promise<Vote> {
    const [created] = await db.insert(votes).values(vote).returning();
    return created;
  }

  async getVotesByPair(pairId: string): Promise<Vote[]> {
    return db.select().from(votes).where(eq(votes.pairId, pairId));
  }

  async getUserVotes(userId: string): Promise<(Vote & { pair: Pair })[]> {
    const result = await db
      .select()
      .from(votes)
      .innerJoin(pairs, eq(votes.pairId, pairs.id))
      .where(eq(votes.userId, userId))
      .orderBy(desc(votes.createdAt));
    
    return result.map(row => ({
      ...row.votes,
      pair: row.pairs,
    }));
  }

  async updateVote(
    pairId: string, 
    userId: string, 
    updates: Partial<Pick<Vote, "scoreBinary" | "scoreNumeric" | "scoringMode" | "expertSelectedCode" | "reviewerNotes">>
  ): Promise<Vote | null> {
    const [updated] = await db
      .update(votes)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(and(eq(votes.pairId, pairId), eq(votes.userId, userId)))
      .returning();
    return updated || null;
  }

  async getUserVotesCount(userId: string): Promise<number> {
    const [result] = await db
      .select({ count: count() })
      .from(votes)
      .where(eq(votes.userId, userId));
    return result?.count || 0;
  }

  async getUserVotesPerCampaign(userId: string): Promise<{ campaignId: string; campaignName: string; voteCount: number }[]> {
    const result = await db
      .select({
        campaignId: campaigns.id,
        campaignName: campaigns.name,
        voteCount: sql<number>`COUNT(${votes.id})::int`,
      })
      .from(votes)
      .innerJoin(pairs, eq(votes.pairId, pairs.id))
      .innerJoin(campaigns, eq(pairs.campaignId, campaigns.id))
      .where(eq(votes.userId, userId))
      .groupBy(campaigns.id, campaigns.name);
    
    return result;
  }

  async getUserRecentActivity(userId: string, days: number): Promise<{ date: string; count: number }[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const result = await db
      .select({
        date: sql<string>`DATE(${votes.createdAt})::text`,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(votes)
      .where(and(eq(votes.userId, userId), gte(votes.createdAt, startDate)))
      .groupBy(sql`DATE(${votes.createdAt})`)
      .orderBy(sql`DATE(${votes.createdAt})`);
    
    return result;
  }

  async getUserAgreementRate(userId: string): Promise<number | null> {
    // Calculate agreement rate: how often user's vote matches the majority
    const userVotesWithConsensus = await db
      .select({
        userVote: votes.scoreBinary,
        pairId: votes.pairId,
      })
      .from(votes)
      .where(eq(votes.userId, userId));

    if (userVotesWithConsensus.length === 0) return null;

    let agreements = 0;
    let comparablePairs = 0;

    for (const uv of userVotesWithConsensus) {
      // Get all votes for this pair
      const pairVotes = await db
        .select({ scoreBinary: votes.scoreBinary })
        .from(votes)
        .where(eq(votes.pairId, uv.pairId));
      
      if (pairVotes.length < 2) continue; // Need at least 2 votes to compare
      
      const positiveVotes = pairVotes.filter(v => v.scoreBinary === true).length;
      const consensus = positiveVotes > pairVotes.length / 2;
      
      if (uv.userVote === consensus) {
        agreements++;
      }
      comparablePairs++;
    }

    return comparablePairs > 0 ? agreements / comparablePairs : null;
  }

  async getUserStats(userId: string): Promise<UserStats> {
    const totalVotes = await this.getUserVotesCount(userId);
    const votesPerCampaign = await this.getUserVotesPerCampaign(userId);
    const agreementRate = await this.getUserAgreementRate(userId);
    const recentActivity = await this.getUserRecentActivity(userId, 30);
    
    return {
      totalVotes,
      votesPerCampaign,
      agreementRate,
      recentActivity,
    };
  }

  // Skipped pairs
  async skipPair(pairId: string, userId: string): Promise<void> {
    await db.insert(skippedPairs).values({ pairId, userId }).onConflictDoNothing();
  }

  // Allowed domains
  async isDomainAllowed(domain: string): Promise<boolean> {
    const [result] = await db
      .select()
      .from(allowedDomains)
      .where(eq(allowedDomains.domain, domain.toLowerCase()));
    return !!result;
  }

  async getAllowedDomains(): Promise<AllowedDomain[]> {
    return db.select().from(allowedDomains).orderBy(allowedDomains.domain);
  }

  async addAllowedDomain(domainData: InsertAllowedDomain): Promise<AllowedDomain> {
    const [domain] = await db
      .insert(allowedDomains)
      .values({ ...domainData, domain: domainData.domain.toLowerCase() })
      .returning();
    return domain;
  }

  async removeAllowedDomain(domain: string): Promise<void> {
    await db.delete(allowedDomains).where(eq(allowedDomains.domain, domain.toLowerCase()));
  }

  // Admin stats
  async getAdminStats() {
    const [userCount] = await db.select({ count: count() }).from(users);
    const [campaignCount] = await db.select({ count: count() }).from(campaigns);
    const [voteCount] = await db.select({ count: count() }).from(votes);
    const [activeCount] = await db
      .select({ count: count() })
      .from(campaigns)
      .where(eq(campaigns.status, "active"));
    const recentUsers = await this.getRecentUsers(5);

    return {
      totalUsers: userCount?.count || 0,
      totalCampaigns: campaignCount?.count || 0,
      totalVotes: voteCount?.count || 0,
      activeCampaigns: activeCount?.count || 0,
      recentUsers,
    };
  }

  // Export
  async getCampaignExportData(campaignId: string) {
    const campaignPairs = await db.select().from(pairs).where(eq(pairs.campaignId, campaignId));
    
    const result = [];
    for (const pair of campaignPairs) {
      const pairVotes = await this.getVotesByPair(pair.id);
      const positiveVotes = pairVotes.filter(v => v.scoreBinary === true).length;
      const positiveRate = pairVotes.length > 0 ? positiveVotes / pairVotes.length : null;
      
      result.push({
        pair,
        votes: pairVotes,
        positiveRate,
      });
    }
    
    return result;
  }

  async getCampaignResults(campaignId: string, options: {
    page: number;
    limit: number;
    search?: string;
    consensus?: "match" | "no_match" | "disagreement" | "unreviewed" | null;
    minVotes?: number;
    maxVotes?: number;
  }) {
    const { page, limit, search, consensus, minVotes, maxVotes } = options;
    const offset = (page - 1) * limit;

    // Get all pairs with vote/skip aggregates
    const allPairs = await db
      .select({
        pair: pairs,
        voteCount: sql<number>`COALESCE(COUNT(DISTINCT ${votes.id}), 0)::int`,
        positiveVotes: sql<number>`COALESCE(SUM(CASE WHEN ${votes.scoreBinary} = true THEN 1 ELSE 0 END), 0)::int`,
        negativeVotes: sql<number>`COALESCE(SUM(CASE WHEN ${votes.scoreBinary} = false THEN 1 ELSE 0 END), 0)::int`,
        skipCount: sql<number>`COALESCE(COUNT(DISTINCT ${skippedPairs.id}), 0)::int`,
      })
      .from(pairs)
      .leftJoin(votes, eq(pairs.id, votes.pairId))
      .leftJoin(skippedPairs, eq(pairs.id, skippedPairs.pairId))
      .where(eq(pairs.campaignId, campaignId))
      .groupBy(pairs.id)
      .orderBy(desc(pairs.createdAt));

    // Apply filters in memory
    let filteredPairs = allPairs.map(row => ({
      pair: row.pair,
      voteCount: row.voteCount,
      positiveVotes: row.positiveVotes,
      negativeVotes: row.negativeVotes,
      skipCount: row.skipCount,
      positiveRate: row.voteCount > 0 ? row.positiveVotes / row.voteCount : null,
    }));

    // Search filter
    if (search) {
      const searchLower = search.toLowerCase();
      filteredPairs = filteredPairs.filter(
        row => 
          row.pair.sourceText.toLowerCase().includes(searchLower) ||
          row.pair.targetText.toLowerCase().includes(searchLower) ||
          row.pair.sourceId.toLowerCase().includes(searchLower) ||
          row.pair.targetId.toLowerCase().includes(searchLower)
      );
    }

    // Consensus filter
    if (consensus) {
      filteredPairs = filteredPairs.filter(row => {
        if (consensus === "unreviewed") return row.voteCount === 0;
        if (consensus === "match") return row.positiveRate !== null && row.positiveRate > 0.6;
        if (consensus === "no_match") return row.positiveRate !== null && row.positiveRate < 0.4;
        if (consensus === "disagreement") return row.positiveRate !== null && row.positiveRate >= 0.4 && row.positiveRate <= 0.6;
        return true;
      });
    }

    // Vote count filters
    if (minVotes !== undefined) {
      filteredPairs = filteredPairs.filter(row => row.voteCount >= minVotes);
    }
    if (maxVotes !== undefined) {
      filteredPairs = filteredPairs.filter(row => row.voteCount <= maxVotes);
    }

    const total = filteredPairs.length;
    const totalPages = Math.ceil(total / limit);
    const paginatedPairs = filteredPairs.slice(offset, offset + limit);

    return {
      pairs: paginatedPairs,
      total,
      page,
      totalPages,
    };
  }

  async getPairDetails(pairId: string) {
    const [pair] = await db.select().from(pairs).where(eq(pairs.id, pairId));
    if (!pair) return null;

    const pairVotes = await db
      .select({
        vote: votes,
        user: {
          id: users.id,
          email: users.email,
          displayName: users.displayName,
        },
      })
      .from(votes)
      .innerJoin(users, eq(votes.userId, users.id))
      .where(eq(votes.pairId, pairId))
      .orderBy(desc(votes.createdAt));

    const [skipResult] = await db
      .select({ count: count() })
      .from(skippedPairs)
      .where(eq(skippedPairs.pairId, pairId));

    return {
      pair,
      votes: pairVotes.map(row => ({
        ...row.vote,
        user: row.user,
      })),
      skipCount: skipResult?.count || 0,
    };
  }
  
  async executeReadOnlyQuery(sqlQuery: string): Promise<{ columns: string[]; rows: Record<string, unknown>[] }> {
    const result = await db.execute(sql.raw(sqlQuery));
    if (!result.rows || result.rows.length === 0) {
      return { columns: [], rows: [] };
    }
    const columns = result.fields?.map((f: { name: string }) => f.name) || Object.keys(result.rows[0] || {});
    return {
      columns,
      rows: result.rows as Record<string, unknown>[],
    };
  }
  
  async getImportTemplates(): Promise<ImportTemplate[]> {
    return db.select().from(importTemplates).orderBy(desc(importTemplates.createdAt));
  }
  
  async getImportTemplate(id: string): Promise<ImportTemplate | undefined> {
    const [template] = await db.select().from(importTemplates).where(eq(importTemplates.id, id));
    return template;
  }
  
  async createImportTemplate(template: InsertImportTemplate): Promise<ImportTemplate> {
    const [created] = await db.insert(importTemplates).values(template).returning();
    return created;
  }
  
  async deleteImportTemplate(id: string): Promise<void> {
    await db.delete(importTemplates).where(eq(importTemplates.id, id));
  }
  
  async calculateKrippendorffAlpha(campaignId: string): Promise<{
    alpha: number | null;
    raterCount: number;
    pairCount: number;
    voteCount: number;
  }> {
    const campaignVotes = await db
      .select({
        pairId: votes.pairId,
        userId: votes.userId,
        scoreBinary: votes.scoreBinary,
        scoreNumeric: votes.scoreNumeric,
        scoringMode: votes.scoringMode,
      })
      .from(votes)
      .innerJoin(pairs, eq(votes.pairId, pairs.id))
      .where(eq(pairs.campaignId, campaignId));

    if (campaignVotes.length === 0) {
      return { alpha: null, raterCount: 0, pairCount: 0, voteCount: 0 };
    }

    const raters = new Set<string>();
    const pairIds = new Set<string>();
    campaignVotes.forEach(v => {
      raters.add(v.userId);
      pairIds.add(v.pairId);
    });

    if (raters.size < 2) {
      return { alpha: null, raterCount: raters.size, pairCount: pairIds.size, voteCount: campaignVotes.length };
    }

    const dataMatrix: Map<string, number[]> = new Map();
    campaignVotes.forEach(v => {
      if (!dataMatrix.has(v.pairId)) {
        dataMatrix.set(v.pairId, []);
      }
      const score = v.scoringMode === "numeric" 
        ? (v.scoreNumeric ?? 3) 
        : (v.scoreBinary ? 1 : 0);
      dataMatrix.get(v.pairId)!.push(score);
    });

    const unitsWithRatings = Array.from(dataMatrix.entries())
      .filter(([_, scores]) => scores.length >= 2);

    if (unitsWithRatings.length < 1) {
      return { alpha: null, raterCount: raters.size, pairCount: pairIds.size, voteCount: campaignVotes.length };
    }

    let totalN = 0;
    const valueCounts: Map<number, number> = new Map();
    
    unitsWithRatings.forEach(([_, scores]) => {
      scores.forEach(score => {
        totalN++;
        valueCounts.set(score, (valueCounts.get(score) || 0) + 1);
      });
    });

    if (totalN < 3) {
      return { alpha: null, raterCount: raters.size, pairCount: pairIds.size, voteCount: campaignVotes.length };
    }

    let observedDisagreement = 0;
    let totalPairingsWithinUnits = 0;

    unitsWithRatings.forEach(([_, scores]) => {
      const m = scores.length;
      if (m < 2) return;
      
      for (let i = 0; i < m; i++) {
        for (let j = i + 1; j < m; j++) {
          const diff = scores[i] === scores[j] ? 0 : 1;
          observedDisagreement += diff;
          totalPairingsWithinUnits++;
        }
      }
    });

    if (totalPairingsWithinUnits === 0) {
      return { alpha: null, raterCount: raters.size, pairCount: pairIds.size, voteCount: campaignVotes.length };
    }

    const Do = observedDisagreement / totalPairingsWithinUnits;

    let expectedDisagreement = 0;
    const values = Array.from(valueCounts.keys());
    
    for (let i = 0; i < values.length; i++) {
      for (let j = i + 1; j < values.length; j++) {
        const ni = valueCounts.get(values[i])!;
        const nj = valueCounts.get(values[j])!;
        const diff = values[i] === values[j] ? 0 : 1;
        expectedDisagreement += ni * nj * diff;
      }
    }

    const totalPairings = (totalN * (totalN - 1)) / 2;
    const De = expectedDisagreement / totalPairings;

    if (De === 0) {
      return { alpha: 1, raterCount: raters.size, pairCount: pairIds.size, voteCount: campaignVotes.length };
    }

    const alpha = 1 - (Do / De);

    return {
      alpha: Math.max(-1, Math.min(1, Math.round(alpha * 1000) / 1000)),
      raterCount: raters.size,
      pairCount: pairIds.size,
      voteCount: campaignVotes.length,
    };
  }
}

export const storage = new DatabaseStorage();
