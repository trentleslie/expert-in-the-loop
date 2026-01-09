import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { 
  Users, 
  ClipboardList, 
  CheckCircle2, 
  TrendingUp,
  Download,
  BarChart3
} from "lucide-react";
import { Link } from "wouter";
import type { CampaignWithStats, User } from "@shared/schema";

type AdminStats = {
  totalUsers: number;
  totalCampaigns: number;
  totalVotes: number;
  activeCampaigns: number;
  recentUsers: User[];
};

function MetricCard({ 
  icon: Icon, 
  label, 
  value, 
  change,
  href 
}: { 
  icon: React.ElementType; 
  label: string; 
  value: string | number;
  change?: string;
  href?: string;
}) {
  const content = (
    <Card className={`border-card-border ${href ? "hover-elevate cursor-pointer" : ""}`}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-3xl font-semibold text-foreground mt-1">{value}</p>
            {change && (
              <p className="text-xs text-green-600 dark:text-green-400 mt-1 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                {change}
              </p>
            )}
          </div>
          <div className="p-3 rounded-lg bg-primary/10">
            <Icon className="w-5 h-5 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }
  return content;
}

function CampaignRow({ campaign }: { campaign: CampaignWithStats }) {
  const progress = campaign.totalPairs > 0 
    ? Math.round((campaign.reviewedPairs / campaign.totalPairs) * 100) 
    : 0;

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active": return "bg-green-500/10 text-green-700 dark:text-green-400";
      case "draft": return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400";
      case "completed": return "bg-blue-500/10 text-blue-700 dark:text-blue-400";
      case "archived": return "bg-muted text-muted-foreground";
      default: return "";
    }
  };

  return (
    <div className="flex items-center gap-4 py-4 border-b border-border last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{campaign.name}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {campaign.reviewedPairs} / {campaign.totalPairs} pairs reviewed
        </p>
      </div>
      <div className="w-24 hidden sm:block">
        <Progress value={progress} className="h-1.5" />
      </div>
      <Badge variant="outline" className={`flex-shrink-0 ${getStatusColor(campaign.status)}`}>
        {campaign.status}
      </Badge>
    </div>
  );
}

function RecentUserRow({ user }: { user: User }) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-border last:border-0">
      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
        <span className="text-sm font-medium text-primary">
          {user.displayName?.charAt(0) || user.email.charAt(0)}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{user.displayName}</p>
        <p className="text-xs text-muted-foreground truncate">{user.email}</p>
      </div>
      <Badge variant={user.role === "admin" ? "default" : "secondary"} className="flex-shrink-0">
        {user.role}
      </Badge>
    </div>
  );
}

export default function AdminDashboard() {
  const { data: stats, isLoading: statsLoading } = useQuery<AdminStats>({
    queryKey: ["/api/admin/stats"],
  });

  const { data: campaigns, isLoading: campaignsLoading } = useQuery<CampaignWithStats[]>({
    queryKey: ["/api/campaigns"],
  });

  const activeCampaigns = campaigns?.filter(c => c.status === "active").slice(0, 5) || [];

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto p-6 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Admin Dashboard</h1>
            <p className="text-muted-foreground">
              Overview of campaigns, users, and review activity
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/admin/campaigns">
              <Button variant="outline" data-testid="link-manage-campaigns">
                Manage Campaigns
              </Button>
            </Link>
          </div>
        </div>

        {/* Metrics */}
        {statsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              icon={Users}
              label="Total Users"
              value={stats?.totalUsers || 0}
              href="/admin/users"
            />
            <MetricCard
              icon={ClipboardList}
              label="Total Campaigns"
              value={stats?.totalCampaigns || 0}
              href="/admin/campaigns"
            />
            <MetricCard
              icon={CheckCircle2}
              label="Total Votes"
              value={stats?.totalVotes || 0}
            />
            <MetricCard
              icon={BarChart3}
              label="Active Campaigns"
              value={stats?.activeCampaigns || 0}
            />
          </div>
        )}

        {/* Two column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Active Campaigns */}
          <Card className="border-card-border">
            <CardHeader className="flex flex-row items-center justify-between gap-4 pb-4">
              <div>
                <CardTitle className="text-base font-medium">Active Campaigns</CardTitle>
                <CardDescription>Campaigns currently accepting reviews</CardDescription>
              </div>
              <Link href="/admin/campaigns">
                <Button variant="ghost" size="sm">View All</Button>
              </Link>
            </CardHeader>
            <CardContent>
              {campaignsLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-12" />
                  <Skeleton className="h-12" />
                  <Skeleton className="h-12" />
                </div>
              ) : activeCampaigns.length > 0 ? (
                <div>
                  {activeCampaigns.map((campaign) => (
                    <CampaignRow key={campaign.id} campaign={campaign} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No active campaigns
                </p>
              )}
            </CardContent>
          </Card>

          {/* Recent Users */}
          <Card className="border-card-border">
            <CardHeader className="flex flex-row items-center justify-between gap-4 pb-4">
              <div>
                <CardTitle className="text-base font-medium">Recent Users</CardTitle>
                <CardDescription>Newly registered users</CardDescription>
              </div>
              <Link href="/admin/users">
                <Button variant="ghost" size="sm">View All</Button>
              </Link>
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-12" />
                  <Skeleton className="h-12" />
                  <Skeleton className="h-12" />
                </div>
              ) : stats?.recentUsers && stats.recentUsers.length > 0 ? (
                <div>
                  {stats.recentUsers.map((user) => (
                    <RecentUserRow key={user.id} user={user} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No users yet
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
