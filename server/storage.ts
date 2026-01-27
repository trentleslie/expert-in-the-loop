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
  
  // Analytics
  getCampaignAnalyticsSummary(): Promise<{
    id: string;
    name: string;
    status: string;
    totalPairs: number;
    reviewedPairs: number;
    completionPercent: number;
    totalVotes: number;
    uniqueReviewers: number;
    avgVotesPerPair: number;
    alpha: number | null;
    disagreementCount: number;
    daysSinceLastActivity: number | null;
  }[]>;
  
  getVoteDistribution(campaignId: string): Promise<{
    binaryVotes: number;
    numericVotes: number;
    matchVotes: number;
    noMatchVotes: number;
    numericScoreDistribution: { score: number; count: number }[];
    numericStats: { mean: number; median: number; stdDev: number } | null;
    votesByDay: { date: string; binary: number; numeric: number }[];
  }>;
  
  getReviewerStats(campaignId: string): Promise<{
    userId: string;
    email: string;
    displayName: string | null;
    totalVotes: number;
    activityLast7Days: number[];
    agreementRate: number | null;
    positiveRate: number | null;
    avgTimeSeconds: number | null;
    skipCount: number;
    flags: string[];
  }[]>;
  
  getHighDisagreementPairs(campaignId: string, limit?: number): Promise<{
    pair: Pair;
    voteCount: number;
    positiveVotes: number;
    negativeVotes: number;
    positiveRate: number;
    numericScores: number[];
    numericMean: number | null;
    numericStdDev: number | null;
  }[]>;
  
  getDisagreementByConfidence(campaignId: string): Promise<{
    bucket: string;
    totalPairs: number;
    disagreementCount: number;
    disagreementRate: number;
  }[]>;
  
  getSkipAnalysis(campaignId: string): Promise<{
    totalSkips: number;
    uniquePairsSkipped: number;
    skipRate: number;
    mostSkippedPairs: {
      pair: Pair;
      skipCount: number;
      voteCount: number;
    }[];
    skipsByReviewer: {
      userId: string;
      email: string;
      skipCount: number;
      skipRate: number;
    }[];
  }>;
  
  getVotesOverTime(campaignId?: string): Promise<{
    date: string;
    count: number;
    cumulative: number;
  }[]>;
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
            THEN AVG(CASE WHEN ${votes.scoreBinary} = 'match' THEN 1.0 WHEN ${votes.scoreBinary} = 'no_match' THEN 0.0 ELSE NULL END)
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
                 AVG(CASE WHEN ${votes.scoreBinary} = 'match' THEN 1.0 WHEN ${votes.scoreBinary} = 'no_match' THEN 0.0 ELSE NULL END) BETWEEN 0.4 AND 0.6 THEN 2
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
    const updateData: Record<string, unknown> = { ...updates };
    updateData.updatedAt = new Date();
    const [updated] = await db
      .update(votes)
      .set(updateData)
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
      
      // Only count definitive votes (match or no_match) for consensus
      const definitiveVotes = pairVotes.filter(v => v.scoreBinary === "match" || v.scoreBinary === "no_match");
      if (definitiveVotes.length < 2) continue;
      
      const positiveVotes = definitiveVotes.filter(v => v.scoreBinary === "match").length;
      const consensusIsMatch = positiveVotes > definitiveVotes.length / 2;
      
      // Compare user's vote to consensus (only if user's vote is definitive)
      const userVoteIsMatch = uv.userVote === "match";
      const userVoteIsNoMatch = uv.userVote === "no_match";
      
      if (!userVoteIsMatch && !userVoteIsNoMatch) continue; // Skip unsure votes
      
      if ((userVoteIsMatch && consensusIsMatch) || (userVoteIsNoMatch && !consensusIsMatch)) {
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
      const positiveVotes = pairVotes.filter(v => v.scoreBinary === "match").length;
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
        positiveVotes: sql<number>`COALESCE(SUM(CASE WHEN ${votes.scoreBinary} = 'match' THEN 1 ELSE 0 END), 0)::int`,
        negativeVotes: sql<number>`COALESCE(SUM(CASE WHEN ${votes.scoreBinary} = 'no_match' THEN 1 ELSE 0 END), 0)::int`,
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
  
  async getCampaignAnalyticsSummary(): Promise<{
    id: string;
    name: string;
    status: string;
    totalPairs: number;
    reviewedPairs: number;
    completionPercent: number;
    totalVotes: number;
    uniqueReviewers: number;
    avgVotesPerPair: number;
    alpha: number | null;
    disagreementCount: number;
    daysSinceLastActivity: number | null;
  }[]> {
    const allCampaigns = await this.getAllCampaigns();
    const result = [];
    
    for (const campaign of allCampaigns) {
      const campaignVotes = await db
        .select({ userId: votes.userId, pairId: votes.pairId, scoreBinary: votes.scoreBinary, scoringMode: votes.scoringMode, createdAt: votes.createdAt })
        .from(votes)
        .innerJoin(pairs, eq(votes.pairId, pairs.id))
        .where(eq(pairs.campaignId, campaign.id));
      
      const uniqueReviewers = new Set(campaignVotes.map(v => v.userId)).size;
      const reviewedPairs = new Set(campaignVotes.map(v => v.pairId)).size;
      const avgVotesPerPair = reviewedPairs > 0 ? Math.round((campaignVotes.length / reviewedPairs) * 10) / 10 : 0;
      
      const pairVoteCounts = new Map<string, { positive: number; negative: number }>();
      campaignVotes.forEach(v => {
        if (v.scoringMode !== "binary") return;
        if (!pairVoteCounts.has(v.pairId)) {
          pairVoteCounts.set(v.pairId, { positive: 0, negative: 0 });
        }
        const counts = pairVoteCounts.get(v.pairId)!;
        if (v.scoreBinary === "match") counts.positive++;
        else if (v.scoreBinary === "no_match") counts.negative++;
        // Note: "unsure" votes are not counted as positive or negative
      });
      
      let disagreementCount = 0;
      pairVoteCounts.forEach(counts => {
        const total = counts.positive + counts.negative;
        if (total >= 2) {
          const positiveRate = counts.positive / total;
          if (positiveRate >= 0.4 && positiveRate <= 0.6) {
            disagreementCount++;
          }
        }
      });
      
      const alpha = await this.calculateKrippendorffAlpha(campaign.id);
      
      let daysSinceLastActivity: number | null = null;
      if (campaignVotes.length > 0) {
        const latestVote = campaignVotes.reduce((latest, v) => 
          v.createdAt > latest ? v.createdAt : latest, campaignVotes[0].createdAt);
        daysSinceLastActivity = Math.floor((Date.now() - new Date(latestVote).getTime()) / (1000 * 60 * 60 * 24));
      }
      
      result.push({
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        totalPairs: campaign.totalPairs || 0,
        reviewedPairs,
        completionPercent: campaign.totalPairs ? Math.round((reviewedPairs / campaign.totalPairs) * 100) : 0,
        totalVotes: campaignVotes.length,
        uniqueReviewers,
        avgVotesPerPair,
        alpha: alpha.alpha,
        disagreementCount,
        daysSinceLastActivity,
      });
    }
    
    return result;
  }
  
  async getVoteDistribution(campaignId: string): Promise<{
    binaryVotes: number;
    numericVotes: number;
    matchVotes: number;
    noMatchVotes: number;
    numericScoreDistribution: { score: number; count: number }[];
    numericStats: { mean: number; median: number; stdDev: number } | null;
    votesByDay: { date: string; binary: number; numeric: number }[];
  }> {
    const campaignVotes = await db
      .select({
        scoringMode: votes.scoringMode,
        scoreBinary: votes.scoreBinary,
        scoreNumeric: votes.scoreNumeric,
        createdAt: votes.createdAt,
      })
      .from(votes)
      .innerJoin(pairs, eq(votes.pairId, pairs.id))
      .where(eq(pairs.campaignId, campaignId));
    
    let binaryVotes = 0, numericVotes = 0, matchVotes = 0, noMatchVotes = 0;
    const numericScores: number[] = [];
    const dayMap = new Map<string, { binary: number; numeric: number }>();
    
    campaignVotes.forEach(v => {
      if (v.scoringMode === "numeric") {
        numericVotes++;
        if (v.scoreNumeric) numericScores.push(v.scoreNumeric);
      } else {
        binaryVotes++;
        if (v.scoreBinary) matchVotes++;
        else noMatchVotes++;
      }
      
      const dateStr = new Date(v.createdAt).toISOString().split('T')[0];
      if (!dayMap.has(dateStr)) {
        dayMap.set(dateStr, { binary: 0, numeric: 0 });
      }
      const day = dayMap.get(dateStr)!;
      if (v.scoringMode === "numeric") day.numeric++;
      else day.binary++;
    });
    
    const numericScoreDistribution: { score: number; count: number }[] = [];
    for (let i = 1; i <= 5; i++) {
      numericScoreDistribution.push({
        score: i,
        count: numericScores.filter(s => s === i).length,
      });
    }
    
    let numericStats: { mean: number; median: number; stdDev: number } | null = null;
    if (numericScores.length > 0) {
      const mean = numericScores.reduce((a, b) => a + b, 0) / numericScores.length;
      const sorted = [...numericScores].sort((a, b) => a - b);
      const median = sorted.length % 2 === 0 
        ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
        : sorted[Math.floor(sorted.length / 2)];
      const variance = numericScores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / numericScores.length;
      const stdDev = Math.sqrt(variance);
      numericStats = {
        mean: Math.round(mean * 100) / 100,
        median: Math.round(median * 100) / 100,
        stdDev: Math.round(stdDev * 100) / 100,
      };
    }
    
    const votesByDay = Array.from(dayMap.entries())
      .map(([date, counts]) => ({ date, ...counts }))
      .sort((a, b) => a.date.localeCompare(b.date));
    
    return {
      binaryVotes,
      numericVotes,
      matchVotes,
      noMatchVotes,
      numericScoreDistribution,
      numericStats,
      votesByDay,
    };
  }
  
  async getReviewerStats(campaignId: string): Promise<{
    userId: string;
    email: string;
    displayName: string | null;
    totalVotes: number;
    activityLast7Days: number[];
    agreementRate: number | null;
    positiveRate: number | null;
    avgTimeSeconds: number | null;
    skipCount: number;
    flags: string[];
  }[]> {
    const campaignVotes = await db
      .select({
        id: votes.id,
        pairId: votes.pairId,
        userId: votes.userId,
        scoreBinary: votes.scoreBinary,
        scoringMode: votes.scoringMode,
        createdAt: votes.createdAt,
      })
      .from(votes)
      .innerJoin(pairs, eq(votes.pairId, pairs.id))
      .where(eq(pairs.campaignId, campaignId));
    
    const usersData = await db.select().from(users);
    const userMap = new Map(usersData.map(u => [u.id, u]));
    
    const skipsData = await db
      .select({ userId: skippedPairs.userId, pairId: skippedPairs.pairId })
      .from(skippedPairs)
      .innerJoin(pairs, eq(skippedPairs.pairId, pairs.id))
      .where(eq(pairs.campaignId, campaignId));
    
    const skipsByUser = new Map<string, number>();
    skipsData.forEach(s => {
      skipsByUser.set(s.userId, (skipsByUser.get(s.userId) || 0) + 1);
    });
    
    const binaryVotes = campaignVotes.filter(v => v.scoringMode === "binary");
    
    const pairConsensus = new Map<string, boolean>();
    const pairVotes = new Map<string, { positive: number; negative: number }>();
    binaryVotes.forEach(v => {
      if (!pairVotes.has(v.pairId)) {
        pairVotes.set(v.pairId, { positive: 0, negative: 0 });
      }
      const counts = pairVotes.get(v.pairId)!;
      if (v.scoreBinary === "match") counts.positive++;
      else if (v.scoreBinary === "no_match") counts.negative++;
      // Note: "unsure" votes are not counted as positive or negative
    });
    pairVotes.forEach((counts, pairId) => {
      pairConsensus.set(pairId, counts.positive > counts.negative);
    });
    
    const userStats = new Map<string, {
      votes: typeof campaignVotes;
      binaryVotes: typeof binaryVotes;
      positiveCount: number;
      agreementCount: number;
    }>();
    
    campaignVotes.forEach(v => {
      if (!userStats.has(v.userId)) {
        userStats.set(v.userId, { votes: [], binaryVotes: [], positiveCount: 0, agreementCount: 0 });
      }
      const stats = userStats.get(v.userId)!;
      stats.votes.push(v);
      
      if (v.scoringMode === "binary") {
        stats.binaryVotes.push(v);
        if (v.scoreBinary === "match") stats.positiveCount++;
        
        const consensus = pairConsensus.get(v.pairId);
        // For agreement: compare whether vote matches consensus (only definitive votes count)
        const voteIsPositive = v.scoreBinary === "match" ? true : v.scoreBinary === "no_match" ? false : null;
        if (consensus !== undefined && voteIsPositive !== null && voteIsPositive === consensus) {
          stats.agreementCount++;
        }
      }
    });
    
    const now = new Date();
    const result = [];
    
    for (const [userId, stats] of Array.from(userStats.entries())) {
      const user = userMap.get(userId);
      if (!user) continue;
      
      const activityLast7Days: number[] = [];
      for (let i = 6; i >= 0; i--) {
        const day = new Date(now);
        day.setDate(day.getDate() - i);
        const dayStr = day.toISOString().split('T')[0];
        const count = stats.votes.filter((v: { createdAt: Date }) => 
          new Date(v.createdAt).toISOString().split('T')[0] === dayStr
        ).length;
        activityLast7Days.push(count);
      }
      
      const totalVotes = stats.votes.length;
      const binaryCount = stats.binaryVotes.length;
      const positiveRate = binaryCount >= 5 ? Math.round((stats.positiveCount / binaryCount) * 100) : null;
      const agreementRate = binaryCount >= 5 ? Math.round((stats.agreementCount / binaryCount) * 100) : null;
      const skipCount = skipsByUser.get(userId) || 0;
      
      const flags: string[] = [];
      if (positiveRate !== null && agreementRate !== null) {
        if (agreementRate < 75) flags.push("low_agreement");
        if (positiveRate > 85) flags.push("high_positive_bias");
        if (positiveRate < 35) flags.push("high_negative_bias");
      }
      
      result.push({
        userId,
        email: user.email,
        displayName: user.displayName,
        totalVotes,
        activityLast7Days,
        agreementRate,
        positiveRate,
        avgTimeSeconds: null,
        skipCount,
        flags,
      });
    }
    
    return result.sort((a, b) => b.totalVotes - a.totalVotes);
  }
  
  async getHighDisagreementPairs(campaignId: string, limit: number = 50): Promise<{
    pair: Pair;
    voteCount: number;
    positiveVotes: number;
    negativeVotes: number;
    positiveRate: number;
    numericScores: number[];
    numericMean: number | null;
    numericStdDev: number | null;
  }[]> {
    const campaignPairs = await db.select().from(pairs).where(eq(pairs.campaignId, campaignId));
    const pairMap = new Map(campaignPairs.map(p => [p.id, p]));
    
    const allVotes = await db
      .select()
      .from(votes)
      .innerJoin(pairs, eq(votes.pairId, pairs.id))
      .where(eq(pairs.campaignId, campaignId));
    
    const pairStats = new Map<string, {
      positiveVotes: number;
      negativeVotes: number;
      numericScores: number[];
    }>();
    
    allVotes.forEach(({ votes: v }) => {
      if (!pairStats.has(v.pairId)) {
        pairStats.set(v.pairId, { positiveVotes: 0, negativeVotes: 0, numericScores: [] });
      }
      const stats = pairStats.get(v.pairId)!;
      if (v.scoringMode === "binary") {
        if (v.scoreBinary === "match") stats.positiveVotes++;
        else if (v.scoreBinary === "no_match") stats.negativeVotes++;
        // Note: "unsure" votes are not counted as positive or negative
      }
      if (v.scoreNumeric) stats.numericScores.push(v.scoreNumeric);
    });
    
    const result = [];
    for (const [pairId, stats] of Array.from(pairStats.entries())) {
      const pair = pairMap.get(pairId);
      if (!pair) continue;
      
      const voteCount = stats.positiveVotes + stats.negativeVotes;
      if (voteCount < 2) continue;
      
      const positiveRate = Math.round((stats.positiveVotes / voteCount) * 100);
      
      if (positiveRate < 40 || positiveRate > 60) continue;
      
      let numericMean: number | null = null;
      let numericStdDev: number | null = null;
      if (stats.numericScores.length > 0) {
        numericMean = Math.round((stats.numericScores.reduce((a: number, b: number) => a + b, 0) / stats.numericScores.length) * 100) / 100;
        const variance = stats.numericScores.reduce((sum: number, s: number) => sum + Math.pow(s - numericMean!, 2), 0) / stats.numericScores.length;
        numericStdDev = Math.round(Math.sqrt(variance) * 100) / 100;
      }
      
      result.push({
        pair,
        voteCount,
        positiveVotes: stats.positiveVotes,
        negativeVotes: stats.negativeVotes,
        positiveRate,
        numericScores: stats.numericScores,
        numericMean,
        numericStdDev,
      });
    }
    
    return result
      .sort((a, b) => Math.abs(50 - a.positiveRate) - Math.abs(50 - b.positiveRate))
      .slice(0, limit);
  }
  
  async getDisagreementByConfidence(campaignId: string): Promise<{
    bucket: string;
    totalPairs: number;
    disagreementCount: number;
    disagreementRate: number;
  }[]> {
    const campaignPairs = await db.select().from(pairs).where(eq(pairs.campaignId, campaignId));
    
    const allVotes = await db
      .select()
      .from(votes)
      .innerJoin(pairs, eq(votes.pairId, pairs.id))
      .where(eq(pairs.campaignId, campaignId));
    
    const pairVoteCounts = new Map<string, { positive: number; negative: number }>();
    allVotes.forEach(({ votes: v }) => {
      if (!pairVoteCounts.has(v.pairId)) {
        pairVoteCounts.set(v.pairId, { positive: 0, negative: 0 });
      }
      const counts = pairVoteCounts.get(v.pairId)!;
      if (v.scoreBinary) counts.positive++;
      else counts.negative++;
    });
    
    const buckets = [
      { name: "0.9-1.0", min: 0.9, max: 1.0 },
      { name: "0.8-0.9", min: 0.8, max: 0.9 },
      { name: "0.7-0.8", min: 0.7, max: 0.8 },
      { name: "0.6-0.7", min: 0.6, max: 0.7 },
      { name: "<0.6", min: 0, max: 0.6 },
    ];
    
    const result = buckets.map(bucket => {
      const pairsInBucket = campaignPairs.filter(p => {
        const conf = p.llmConfidence || 0;
        return conf >= bucket.min && conf < bucket.max;
      });
      
      let disagreementCount = 0;
      pairsInBucket.forEach(p => {
        const counts = pairVoteCounts.get(p.id);
        if (counts) {
          const total = counts.positive + counts.negative;
          if (total >= 2) {
            const rate = counts.positive / total;
            if (rate >= 0.4 && rate <= 0.6) disagreementCount++;
          }
        }
      });
      
      return {
        bucket: bucket.name,
        totalPairs: pairsInBucket.length,
        disagreementCount,
        disagreementRate: pairsInBucket.length > 0 ? Math.round((disagreementCount / pairsInBucket.length) * 100) : 0,
      };
    });
    
    return result;
  }
  
  async getSkipAnalysis(campaignId: string): Promise<{
    totalSkips: number;
    uniquePairsSkipped: number;
    skipRate: number;
    mostSkippedPairs: {
      pair: Pair;
      skipCount: number;
      voteCount: number;
    }[];
    skipsByReviewer: {
      userId: string;
      email: string;
      skipCount: number;
      skipRate: number;
    }[];
  }> {
    const campaignPairs = await db.select().from(pairs).where(eq(pairs.campaignId, campaignId));
    const pairMap = new Map(campaignPairs.map(p => [p.id, p]));
    
    const skipsData = await db
      .select()
      .from(skippedPairs)
      .innerJoin(pairs, eq(skippedPairs.pairId, pairs.id))
      .where(eq(pairs.campaignId, campaignId));
    
    const votesData = await db
      .select({ pairId: votes.pairId, userId: votes.userId, id: votes.id })
      .from(votes)
      .innerJoin(pairs, eq(votes.pairId, pairs.id))
      .where(eq(pairs.campaignId, campaignId));
    
    const usersData = await db.select().from(users);
    const userMap = new Map(usersData.map(u => [u.id, u]));
    
    const pairSkipCounts = new Map<string, number>();
    const pairVoteCounts = new Map<string, number>();
    const userSkipCounts = new Map<string, number>();
    const userVoteCounts = new Map<string, number>();
    
    skipsData.forEach(({ skipped_pairs: s }) => {
      pairSkipCounts.set(s.pairId, (pairSkipCounts.get(s.pairId) || 0) + 1);
      userSkipCounts.set(s.userId, (userSkipCounts.get(s.userId) || 0) + 1);
    });
    
    votesData.forEach(v => {
      pairVoteCounts.set(v.pairId, (pairVoteCounts.get(v.pairId) || 0) + 1);
      userVoteCounts.set(v.userId, (userVoteCounts.get(v.userId) || 0) + 1);
    });
    
    const mostSkippedPairs = Array.from(pairSkipCounts.entries())
      .map(([pairId, skipCount]) => ({
        pair: pairMap.get(pairId)!,
        skipCount,
        voteCount: pairVoteCounts.get(pairId) || 0,
      }))
      .filter(p => p.pair)
      .sort((a, b) => b.skipCount - a.skipCount)
      .slice(0, 20);
    
    const skipsByReviewer = Array.from(userSkipCounts.entries())
      .map(([userId, skipCount]) => {
        const user = userMap.get(userId);
        const userVotes = userVoteCounts.get(userId) || 0;
        return {
          userId,
          email: user?.email || "Unknown",
          skipCount,
          skipRate: userVotes + skipCount > 0 ? Math.round((skipCount / (userVotes + skipCount)) * 100) : 0,
        };
      })
      .sort((a, b) => b.skipCount - a.skipCount);
    
    const totalSkips = skipsData.length;
    const uniquePairsSkipped = pairSkipCounts.size;
    const totalReviewed = new Set(votesData.map(v => v.pairId)).size;
    const skipRate = totalReviewed + uniquePairsSkipped > 0 
      ? Math.round((uniquePairsSkipped / (totalReviewed + uniquePairsSkipped)) * 100)
      : 0;
    
    return {
      totalSkips,
      uniquePairsSkipped,
      skipRate,
      mostSkippedPairs,
      skipsByReviewer,
    };
  }
  
  async getVotesOverTime(campaignId?: string): Promise<{
    date: string;
    count: number;
    cumulative: number;
  }[]> {
    let allVotes: { createdAt: Date }[];
    
    if (campaignId) {
      allVotes = await db
        .select({ createdAt: votes.createdAt })
        .from(votes)
        .innerJoin(pairs, eq(votes.pairId, pairs.id))
        .where(eq(pairs.campaignId, campaignId));
    } else {
      allVotes = await db
        .select({ createdAt: votes.createdAt })
        .from(votes);
    }
    
    const dayMap = new Map<string, number>();
    allVotes.forEach(v => {
      const dateStr = new Date(v.createdAt).toISOString().split('T')[0];
      dayMap.set(dateStr, (dayMap.get(dateStr) || 0) + 1);
    });
    
    const sortedDays = Array.from(dayMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
    
    let cumulative = 0;
    return sortedDays.map(d => {
      cumulative += d.count;
      return { ...d, cumulative };
    });
  }
}

export const storage = new DatabaseStorage();
