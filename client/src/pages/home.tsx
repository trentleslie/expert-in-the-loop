import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  ClipboardList, 
  ArrowRight, 
  TrendingUp, 
  CheckCircle2,
  Clock,
  BarChart3 
} from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { partitionByMembership } from "@/lib/campaignFocus";
import type { CampaignWithStats, UserStats } from "@shared/schema";
import {
  EVIDENCE_TIER_META,
  EVIDENCE_TIER_ORDER,
} from "@/lib/evidenceTiers";

/**
 * Segmented evidence-tier progress bar for a campaign. Falls back to a flat
 * percentage Progress when evidenceTiers is absent (older API responses / not
 * tracked). The all-unreviewed case renders an all-grey bar with a "0% reviewed"
 * summary rather than an empty bar.
 */
function EvidenceTierProgress({
  campaign,
  progress,
}: {
  campaign: CampaignWithStats;
  progress: number;
}) {
  const tiers = campaign.evidenceTiers;

  // No tier data available — fall back to the flat percentage bar.
  if (!tiers) {
    return (
      <>
        <Progress value={progress} className="h-2" />
        <p className="text-xs text-muted-foreground text-right">{progress}% complete</p>
      </>
    );
  }

  const total = EVIDENCE_TIER_ORDER.reduce((sum, t) => sum + (tiers[t] ?? 0), 0);

  return (
    <>
      <div
        className="flex h-2 w-full overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={EVIDENCE_TIER_ORDER.map(
          (t) => `${EVIDENCE_TIER_META[t].label}: ${tiers[t] ?? 0}`,
        ).join(", ")}
        data-testid={`evidence-bar-${campaign.id}`}
      >
        {total > 0 &&
          EVIDENCE_TIER_ORDER.map((t) => {
            const count = tiers[t] ?? 0;
            if (count === 0) return null;
            return (
              <div
                key={t}
                style={{
                  width: `${(count / total) * 100}%`,
                  backgroundColor: EVIDENCE_TIER_META[t].barColor,
                }}
                title={`${EVIDENCE_TIER_META[t].label}: ${count}`}
              />
            );
          })}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {EVIDENCE_TIER_ORDER.filter((t) => (tiers[t] ?? 0) > 0).map((t) => {
          const Icon = EVIDENCE_TIER_META[t].icon;
          return (
            <span key={t} className="inline-flex items-center gap-1">
              <Icon
                className="w-3 h-3"
                style={{ color: EVIDENCE_TIER_META[t].barColor }}
              />
              {tiers[t]} {EVIDENCE_TIER_META[t].label.toLowerCase()}
            </span>
          );
        })}
        {total === 0 && <span>No pairs yet</span>}
      </div>
    </>
  );
}

function CampaignCard({ campaign }: { campaign: CampaignWithStats }) {
  const progress = campaign.totalPairs > 0 
    ? Math.round((campaign.reviewedPairs / campaign.totalPairs) * 100) 
    : 0;

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active": return "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20";
      case "draft": return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20";
      case "completed": return "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20";
      case "archived": return "bg-muted text-muted-foreground";
      default: return "";
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "questionnaire_match": return "Match Validation";
      case "loinc_mapping": return "Mapping Review";
      case "custom": return "Custom";
      default: return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }
  };

  return (
    <Card className="border-card-border hover-elevate active-elevate-2 transition-all" data-testid={`card-campaign-${campaign.id}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base font-medium truncate" data-testid={`text-campaign-name-${campaign.id}`}>
              {campaign.name}
            </CardTitle>
            {campaign.description && (
              <CardDescription className="mt-1 line-clamp-2 text-sm">
                {campaign.description}
              </CardDescription>
            )}
          </div>
          <Badge 
            variant="outline" 
            className={`flex-shrink-0 text-xs ${getStatusColor(campaign.status)}`}
            data-testid={`badge-campaign-status-${campaign.id}`}
          >
            {campaign.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ClipboardList className="w-3.5 h-3.5" />
          <span>{getTypeLabel(campaign.campaignType)}</span>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-mono text-xs">
              {campaign.reviewedPairs} / {campaign.totalPairs} pairs
            </span>
          </div>
          <EvidenceTierProgress campaign={campaign} progress={progress} />
        </div>

        <Link href={`/review/${campaign.id}`}>
          <Button 
            className="w-full gap-2" 
            disabled={campaign.status !== "active"}
            data-testid={`button-review-campaign-${campaign.id}`}
          >
            Start Reviewing
            <ArrowRight className="w-4 h-4" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

function StatsCard({ 
  icon: Icon, 
  label, 
  value, 
  subtext,
  testId
}: { 
  icon: React.ElementType; 
  label: string; 
  value: string | number; 
  subtext?: string;
  testId?: string;
}) {
  return (
    <Card className="border-card-border" data-testid={testId}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-md bg-primary/10">
            <Icon className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-xl font-semibold text-foreground mt-0.5" data-testid={testId ? `${testId}-value` : undefined}>{value}</p>
            {subtext && (
              <p className="text-xs text-muted-foreground mt-1">{subtext}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CampaignSkeleton() {
  return (
    <Card className="border-card-border">
      <CardHeader className="pb-3">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-full mt-2" />
      </CardHeader>
      <CardContent className="space-y-4">
        <Skeleton className="h-3 w-1/3" />
        <div className="space-y-2">
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-3 w-16 ml-auto" />
        </div>
        <Skeleton className="h-9 w-full" />
      </CardContent>
    </Card>
  );
}

export default function HomePage() {
  const { user, isAdmin } = useAuth();

  const { data: campaigns, isLoading: campaignsLoading } = useQuery<CampaignWithStats[]>({
    queryKey: ["/api/campaigns"],
  });

  const { data: stats, isLoading: statsLoading } = useQuery<UserStats>({
    queryKey: ["/api/users/me/stats"],
  });

  // Joined campaign ids drive the "Your campaigns" section. Single-string key
  // (getQueryFn fetches queryKey[0]); the join mutation explicitly invalidates
  // this exact key so the home refreshes after joining.
  const { data: joinedIds } = useQuery<string[]>({
    queryKey: ["/api/users/me/campaigns"],
  });

  const activeCampaigns = campaigns?.filter(c => c.status === "active") || [];
  const { joined, others } = partitionByMembership(activeCampaigns, joinedIds ?? []);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto p-6 space-y-8">
        {/* Header */}
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-foreground">
            Welcome back, {user?.displayName?.split(" ")[0] || "Reviewer"}
          </h1>
          <p className="text-muted-foreground">
            Continue reviewing mappings or explore active campaigns
          </p>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {statsLoading ? (
            <>
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </>
          ) : (
            <>
              <StatsCard
                icon={CheckCircle2}
                label="Total Contributions"
                value={stats?.totalVotes || 0}
                subtext="votes submitted"
                testId="card-stat-contributions"
              />
              <StatsCard
                icon={TrendingUp}
                label="Agreement Rate"
                value={stats?.agreementRate != null ? `${Math.round(stats.agreementRate * 100)}%` : "N/A"}
                subtext="with consensus"
                testId="card-stat-agreement"
              />
              <StatsCard
                icon={BarChart3}
                label="Active Campaigns"
                value={activeCampaigns.length}
                subtext="available to review"
                testId="card-stat-campaigns"
              />
            </>
          )}
        </div>

        {/* Campaigns — your joined ones first, then browse all */}
        {campaignsLoading ? (
          <div className="space-y-4">
            <h2 className="text-lg font-medium text-foreground">Your campaigns</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <CampaignSkeleton />
              <CampaignSkeleton />
              <CampaignSkeleton />
            </div>
          </div>
        ) : activeCampaigns.length === 0 ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium text-foreground">Active Campaigns</h2>
              {isAdmin && (
                <Link href="/admin/campaigns">
                  <Button variant="outline" size="sm" data-testid="link-manage-campaigns">
                    Manage Campaigns
                  </Button>
                </Link>
              )}
            </div>
            <Card className="border-card-border">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <div className="p-3 rounded-full bg-muted mb-4">
                  <Clock className="w-6 h-6 text-muted-foreground" />
                </div>
                <h3 className="text-base font-medium text-foreground mb-1">
                  No Active Campaigns
                </h3>
                <p className="text-sm text-muted-foreground text-center max-w-sm">
                  There are no campaigns available for review at the moment.
                  Check back later or contact an administrator.
                </p>
              </CardContent>
            </Card>
          </div>
        ) : (
          <>
            {/* Your campaigns (joined) */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium text-foreground">Your campaigns</h2>
                {isAdmin && (
                  <Link href="/admin/campaigns">
                    <Button variant="outline" size="sm" data-testid="link-manage-campaigns">
                      Manage Campaigns
                    </Button>
                  </Link>
                )}
              </div>
              {joined.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {joined.map((campaign) => (
                    <CampaignCard key={campaign.id} campaign={campaign} />
                  ))}
                </div>
              ) : (
                <Card className="border-card-border" data-testid="card-no-joined-campaigns">
                  <CardContent className="flex flex-col items-center justify-center py-10">
                    <div className="p-3 rounded-full bg-muted mb-4">
                      <ClipboardList className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <h3 className="text-base font-medium text-foreground mb-1">
                      You haven't joined any campaigns yet
                    </h3>
                    <p className="text-sm text-muted-foreground text-center max-w-sm">
                      Open a campaign link shared by an admin to join it, or browse all
                      active campaigns below.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Browse all (active campaigns not joined) */}
            {others.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-lg font-medium text-foreground">Browse all active campaigns</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {others.map((campaign) => (
                    <CampaignCard key={campaign.id} campaign={campaign} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Recent Activity */}
        {stats && stats.recentActivity && stats.recentActivity.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-medium text-foreground">Your Recent Activity</h2>
            <Card className="border-card-border">
              <CardContent className="p-4">
                <div className="flex items-end gap-1 h-24">
                  {stats.recentActivity.slice(-14).map((day, i) => (
                    <div
                      key={i}
                      className="flex-1 bg-primary/20 rounded-t transition-all"
                      style={{ 
                        height: `${Math.max(4, (day.count / Math.max(...stats.recentActivity.map(d => d.count))) * 100)}%`,
                        opacity: 0.4 + (i / 14) * 0.6
                      }}
                      title={`${day.date}: ${day.count} reviews`}
                    />
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  Last 14 days of activity
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
