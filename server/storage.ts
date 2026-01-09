import { 
  users, campaigns, pairs, votes, allowedDomains, skippedPairs,
  type User, type InsertUser,
  type Campaign, type InsertCampaign,
  type Pair, type InsertPair,
  type Vote, type InsertVote,
  type AllowedDomain, type InsertAllowedDomain,
  type InsertSkippedPair,
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
}

export const storage = new DatabaseStorage();
