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
import type { CampaignWithStats, UserStats } from "@shared/schema";

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
      case "questionnaire_match": return "Questionnaire Matching";
      case "loinc_mapping": return "LOINC Mapping";
      case "custom": return "Custom";
      default: return type;
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
          <Progress value={progress} className="h-2" />
          <p className="text-xs text-muted-foreground text-right">{progress}% complete</p>
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

  const activeCampaigns = campaigns?.filter(c => c.status === "active") || [];

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

        {/* Active Campaigns */}
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

          {campaignsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <CampaignSkeleton />
              <CampaignSkeleton />
              <CampaignSkeleton />
            </div>
          ) : activeCampaigns.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeCampaigns.map((campaign) => (
                <CampaignCard key={campaign.id} campaign={campaign} />
              ))}
            </div>
          ) : (
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
          )}
        </div>

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
