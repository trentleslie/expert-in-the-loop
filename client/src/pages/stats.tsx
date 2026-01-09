import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { 
  CheckCircle2, 
  TrendingUp, 
  Calendar,
  Target,
  Award
} from "lucide-react";
import type { UserStats } from "@shared/schema";
import { useAuth } from "@/lib/auth";

function StatCard({ 
  icon: Icon, 
  label, 
  value, 
  subtext,
  variant = "default"
}: { 
  icon: React.ElementType; 
  label: string; 
  value: string | number; 
  subtext?: string;
  variant?: "default" | "highlight";
}) {
  return (
    <Card className={`border-card-border ${variant === "highlight" ? "bg-primary/5" : ""}`}>
      <CardContent className="p-6">
        <div className="flex items-start gap-4">
          <div className={`p-3 rounded-lg ${variant === "highlight" ? "bg-primary/10" : "bg-muted"}`}>
            <Icon className={`w-5 h-5 ${variant === "highlight" ? "text-primary" : "text-muted-foreground"}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-3xl font-semibold text-foreground mt-1">{value}</p>
            {subtext && (
              <p className="text-sm text-muted-foreground mt-1">{subtext}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ActivityChart({ data }: { data: { date: string; count: number }[] }) {
  const maxCount = Math.max(...data.map(d => d.count), 1);
  
  return (
    <Card className="border-card-border">
      <CardHeader>
        <CardTitle className="text-base font-medium">Activity Timeline</CardTitle>
        <CardDescription>Your review activity over the past 30 days</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-1 h-32">
          {data.map((day, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div
                className="w-full bg-primary rounded-t transition-all"
                style={{ 
                  height: `${Math.max(4, (day.count / maxCount) * 100)}%`,
                }}
                title={`${day.date}: ${day.count} reviews`}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-2 text-xs text-muted-foreground">
          <span>{data[0]?.date || ""}</span>
          <span>{data[data.length - 1]?.date || ""}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function CampaignContributions({ 
  data 
}: { 
  data: { campaignId: string; campaignName: string; voteCount: number }[] 
}) {
  const sortedData = [...data].sort((a, b) => b.voteCount - a.voteCount);
  
  return (
    <Card className="border-card-border">
      <CardHeader>
        <CardTitle className="text-base font-medium">Contributions by Campaign</CardTitle>
        <CardDescription>Your voting activity across campaigns</CardDescription>
      </CardHeader>
      <CardContent>
        {sortedData.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No contributions yet. Start reviewing to see your stats!
          </p>
        ) : (
          <div className="space-y-3">
            {sortedData.map((campaign) => (
              <div key={campaign.campaignId} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {campaign.campaignName}
                  </p>
                  <div className="mt-1.5 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ 
                        width: `${(campaign.voteCount / Math.max(...sortedData.map(c => c.voteCount))) * 100}%` 
                      }}
                    />
                  </div>
                </div>
                <Badge variant="secondary" className="flex-shrink-0">
                  {campaign.voteCount}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function StatsPage() {
  const { user } = useAuth();

  const { data: stats, isLoading } = useQuery<UserStats>({
    queryKey: ["/api/users/me/stats"],
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto p-6 space-y-8">
        {/* Header */}
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-foreground">Your Statistics</h1>
          <p className="text-muted-foreground">
            Track your contributions and impact on data harmonization
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
            </div>
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
        ) : (
          <>
            {/* Key metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <StatCard
                icon={CheckCircle2}
                label="Total Contributions"
                value={stats?.totalVotes || 0}
                subtext="votes submitted across all campaigns"
                variant="highlight"
              />
              <StatCard
                icon={TrendingUp}
                label="Agreement Rate"
                value={stats?.agreementRate != null ? `${Math.round(stats.agreementRate * 100)}%` : "N/A"}
                subtext="alignment with consensus decisions"
              />
              <StatCard
                icon={Target}
                label="Campaigns Contributed"
                value={stats?.votesPerCampaign?.length || 0}
                subtext="different campaigns reviewed"
              />
            </div>

            {/* Activity chart */}
            {stats?.recentActivity && stats.recentActivity.length > 0 && (
              <ActivityChart data={stats.recentActivity} />
            )}

            {/* Campaign contributions */}
            {stats?.votesPerCampaign && (
              <CampaignContributions data={stats.votesPerCampaign} />
            )}

            {/* Achievement hints */}
            <Card className="border-card-border bg-gradient-to-r from-primary/5 to-transparent">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-lg bg-primary/10">
                    <Award className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-base font-medium text-foreground">
                      Keep Contributing!
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Your reviews help build gold standard datasets for biomedical data harmonization. 
                      Each vote contributes to training better embedding models and calibrating automated evaluation systems.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
