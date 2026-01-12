import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  BarChart3,
  Users,
  AlertTriangle,
  SkipForward,
  TrendingUp,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

type CampaignSummary = {
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
};

type VoteDistribution = {
  binaryVotes: number;
  numericVotes: number;
  matchVotes: number;
  noMatchVotes: number;
  numericScoreDistribution: { score: number; count: number }[];
  numericStats: { mean: number; median: number; stdDev: number } | null;
  votesByDay: { date: string; binary: number; numeric: number }[];
};

type ReviewerStat = {
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
};

type DisagreementData = {
  pairs: {
    pair: {
      id: string;
      sourceText: string | null;
      targetText: string | null;
      sourceId: string | null;
      targetId: string | null;
      llmConfidence: number | null;
    };
    voteCount: number;
    positiveVotes: number;
    negativeVotes: number;
    positiveRate: number;
    numericScores: number[];
    numericMean: number | null;
    numericStdDev: number | null;
  }[];
  byConfidence: {
    bucket: string;
    totalPairs: number;
    disagreementCount: number;
    disagreementRate: number;
  }[];
};

type SkipAnalysis = {
  totalSkips: number;
  uniquePairsSkipped: number;
  skipRate: number;
  mostSkippedPairs: {
    pair: {
      id: string;
      sourceText: string | null;
      targetText: string | null;
    };
    skipCount: number;
    voteCount: number;
  }[];
  skipsByReviewer: {
    userId: string;
    email: string;
    skipCount: number;
    skipRate: number;
  }[];
};

type VotesOverTime = {
  date: string;
  count: number;
  cumulative: number;
}[];

const COLORS = ["hsl(var(--primary))", "hsl(var(--muted-foreground))", "hsl(var(--destructive))", "hsl(var(--accent))", "hsl(var(--secondary))"];

function CampaignCard({ campaign }: { campaign: CampaignSummary }) {
  const statusColor = campaign.status === "active" ? "default" : campaign.status === "completed" ? "secondary" : "outline";
  
  return (
    <Card className="border-card-border hover-elevate">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base font-medium truncate">{campaign.name}</CardTitle>
          <Badge variant={statusColor} data-testid={`badge-status-${campaign.id}`}>
            {campaign.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-medium">{campaign.completionPercent}%</span>
          </div>
          <Progress value={campaign.completionPercent} className="h-2" />
          <div className="text-xs text-muted-foreground mt-1">
            {campaign.reviewedPairs} of {campaign.totalPairs} pairs reviewed
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-muted-foreground">Votes:</span>{" "}
            <span className="font-medium">{campaign.totalVotes.toLocaleString()}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Reviewers:</span>{" "}
            <span className="font-medium">{campaign.uniqueReviewers}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Avg votes/pair:</span>{" "}
            <span className="font-medium">{campaign.avgVotesPerPair}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Alpha:</span>{" "}
            <span className="font-medium">
              {campaign.alpha !== null ? campaign.alpha.toFixed(2) : "N/A"}
            </span>
          </div>
        </div>
        
        {campaign.disagreementCount > 0 && (
          <div className="flex items-center gap-1 text-sm text-amber-600 dark:text-amber-400">
            <AlertTriangle className="w-4 h-4" />
            {campaign.disagreementCount} high-disagreement pairs
          </div>
        )}
        
        {campaign.daysSinceLastActivity !== null && campaign.daysSinceLastActivity > 0 && (
          <div className="text-xs text-muted-foreground">
            Last activity: {campaign.daysSinceLastActivity} days ago
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function VoteDistributionSection({ data }: { data: VoteDistribution }) {
  const modeData = [
    { name: "Binary", value: data.binaryVotes },
    { name: "Numeric", value: data.numericVotes },
  ];
  
  const binaryData = [
    { name: "Match", value: data.matchVotes },
    { name: "No Match", value: data.noMatchVotes },
  ];

  const scoreLabels = ["Unrelated", "Tangential", "Similar", "Strong", "Exact"];
  const numericData = data.numericScoreDistribution.map((d, i) => ({
    ...d,
    label: `${d.score} (${scoreLabels[i]})`,
  }));

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-6">
        <Card className="border-card-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Scoring Mode Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={modeData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                >
                  {modeData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex justify-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded" style={{ backgroundColor: COLORS[0] }} />
                Binary: {data.binaryVotes.toLocaleString()}
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded" style={{ backgroundColor: COLORS[1] }} />
                Numeric: {data.numericVotes.toLocaleString()}
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-card-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Binary Vote Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={binaryData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                >
                  <Cell fill="hsl(var(--primary))" />
                  <Cell fill="hsl(var(--destructive))" />
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex justify-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-primary" />
                Match: {data.matchVotes.toLocaleString()}
              </div>
              <div className="flex items-center gap-2">
                <XCircle className="w-4 h-4 text-destructive" />
                No Match: {data.noMatchVotes.toLocaleString()}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {data.numericVotes > 0 && (
        <Card className="border-card-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Numeric Score Distribution</CardTitle>
            {data.numericStats && (
              <div className="text-xs text-muted-foreground">
                Mean: {data.numericStats.mean} | Median: {data.numericStats.median} | Std Dev: {data.numericStats.stdDev}
              </div>
            )}
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={numericData}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-50" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
      
      {data.votesByDay.length > 1 && (
        <Card className="border-card-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Vote Activity by Day</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.votesByDay}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-50" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="binary" name="Binary" fill="hsl(var(--primary))" stackId="a" />
                <Bar dataKey="numeric" name="Numeric" fill="hsl(var(--muted-foreground))" stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ReviewerStatsSection({ data }: { data: ReviewerStat[] }) {
  return (
    <Card className="border-card-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Reviewer Statistics</CardTitle>
        <div className="text-xs text-muted-foreground">
          Flags: Low agreement (&lt;75%) | Extreme bias (&gt;85% or &lt;35%) | High skip rate
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reviewer</TableHead>
                <TableHead className="text-right">Votes</TableHead>
                <TableHead className="text-center">Activity (7d)</TableHead>
                <TableHead className="text-right">Agreement</TableHead>
                <TableHead className="text-right">Pos Rate</TableHead>
                <TableHead className="text-right">Skips</TableHead>
                <TableHead>Flags</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((reviewer) => (
                <TableRow key={reviewer.userId}>
                  <TableCell>
                    <div className="max-w-40 truncate" title={reviewer.email}>
                      {reviewer.displayName || reviewer.email}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-medium">{reviewer.totalVotes}</TableCell>
                  <TableCell className="text-center">
                    <div className="flex justify-center gap-0.5">
                      {reviewer.activityLast7Days.map((count, i) => (
                        <div
                          key={i}
                          className="w-2 bg-primary rounded-sm"
                          style={{
                            height: `${Math.min(Math.max(count * 2, 4), 24)}px`,
                            opacity: count > 0 ? 0.3 + (count / Math.max(...reviewer.activityLast7Days)) * 0.7 : 0.1,
                          }}
                        />
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {reviewer.agreementRate !== null ? `${reviewer.agreementRate}%` : "—"}
                  </TableCell>
                  <TableCell className="text-right">{reviewer.positiveRate !== null ? `${reviewer.positiveRate}%` : "—"}</TableCell>
                  <TableCell className="text-right">{reviewer.skipCount}</TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      {reviewer.flags.map((flag) => (
                        <Badge key={flag} variant="outline" className="text-xs">
                          {flag === "low_agreement" && <AlertCircle className="w-3 h-3 mr-1" />}
                          {flag.replace(/_/g, " ")}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function DisagreementSection({ data }: { data: DisagreementData }) {
  return (
    <div className="space-y-6">
      <Card className="border-card-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Disagreement by LLM Confidence</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.byConfidence} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" className="opacity-50" />
              <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
              <YAxis type="category" dataKey="bucket" width={60} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(value: number) => `${value}%`} />
              <Bar dataKey="disagreementRate" name="Disagreement Rate" fill="hsl(var(--destructive))" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="text-xs text-muted-foreground text-center mt-2">
            Lower LLM confidence tends to correlate with higher human disagreement
          </div>
        </CardContent>
      </Card>
      
      <Card className="border-card-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            High Disagreement Pairs ({data.pairs.length} pairs with 40-60% agreement)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.pairs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No high-disagreement pairs found
            </div>
          ) : (
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {data.pairs.slice(0, 10).map((item, i) => (
                <div key={item.pair.id} className="p-3 border rounded-md space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">#{i + 1}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        LLM: {item.pair.llmConfidence?.toFixed(2) || "N/A"}
                      </span>
                      <Badge variant="outline">{item.positiveRate}% agreement</Badge>
                    </div>
                  </div>
                  <div className="grid md:grid-cols-2 gap-2 text-sm">
                    <div className="p-2 bg-muted/50 rounded">
                      <div className="text-xs text-muted-foreground mb-1">{item.pair.sourceId}</div>
                      <div className="line-clamp-2">{item.pair.sourceText}</div>
                    </div>
                    <div className="p-2 bg-muted/50 rounded">
                      <div className="text-xs text-muted-foreground mb-1">{item.pair.targetId}</div>
                      <div className="line-clamp-2">{item.pair.targetText}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="flex items-center gap-1">
                      <CheckCircle className="w-4 h-4 text-primary" />
                      {item.positiveVotes}
                    </span>
                    <span className="flex items-center gap-1">
                      <XCircle className="w-4 h-4 text-destructive" />
                      {item.negativeVotes}
                    </span>
                    {item.numericMean !== null && (
                      <span className="text-muted-foreground">
                        Numeric avg: {item.numericMean} (±{item.numericStdDev})
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SkipAnalysisSection({ data }: { data: SkipAnalysis }) {
  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-3 gap-4">
        <Card className="border-card-border">
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{data.totalSkips}</div>
            <div className="text-sm text-muted-foreground">Total Skips</div>
          </CardContent>
        </Card>
        <Card className="border-card-border">
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{data.uniquePairsSkipped}</div>
            <div className="text-sm text-muted-foreground">Unique Pairs Skipped</div>
          </CardContent>
        </Card>
        <Card className="border-card-border">
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{data.skipRate}%</div>
            <div className="text-sm text-muted-foreground">Overall Skip Rate</div>
          </CardContent>
        </Card>
      </div>
      
      {data.mostSkippedPairs.length > 0 && (
        <Card className="border-card-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Most Skipped Pairs</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead className="text-right">Skips</TableHead>
                  <TableHead className="text-right">Votes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.mostSkippedPairs.slice(0, 10).map((item) => (
                  <TableRow key={item.pair.id}>
                    <TableCell className="max-w-40 truncate">{item.pair.sourceText}</TableCell>
                    <TableCell className="max-w-40 truncate">{item.pair.targetText}</TableCell>
                    <TableCell className="text-right font-medium">{item.skipCount}</TableCell>
                    <TableCell className="text-right">{item.voteCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function AnalyticsDashboard() {
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null);
  
  const { data: campaigns, isLoading: campaignsLoading } = useQuery<CampaignSummary[]>({
    queryKey: ["/api/analytics/campaigns"],
  });
  
  const { data: votesOverTime } = useQuery<VotesOverTime>({
    queryKey: ["/api/analytics/votes-over-time"],
  });
  
  const { data: voteDistribution, isLoading: votesLoading } = useQuery<VoteDistribution>({
    queryKey: ["/api/analytics/campaigns", selectedCampaign, "votes"],
    enabled: !!selectedCampaign,
  });
  
  const { data: reviewerStats, isLoading: reviewersLoading } = useQuery<ReviewerStat[]>({
    queryKey: ["/api/analytics/campaigns", selectedCampaign, "reviewers"],
    enabled: !!selectedCampaign,
  });
  
  const { data: disagreements, isLoading: disagreementsLoading } = useQuery<DisagreementData>({
    queryKey: ["/api/analytics/campaigns", selectedCampaign, "disagreements"],
    enabled: !!selectedCampaign,
  });
  
  const { data: skipAnalysis, isLoading: skipsLoading } = useQuery<SkipAnalysis>({
    queryKey: ["/api/analytics/campaigns", selectedCampaign, "skips"],
    enabled: !!selectedCampaign,
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/admin">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Analytics Dashboard</h1>
            <p className="text-muted-foreground">Campaign statistics and reviewer insights</p>
          </div>
        </div>
        
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview" data-testid="tab-overview">
              <BarChart3 className="w-4 h-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="campaign" data-testid="tab-campaign" disabled={!selectedCampaign}>
              <TrendingUp className="w-4 h-4 mr-2" />
              Campaign Details
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="overview" className="space-y-6">
            <Card className="border-card-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Votes Over Time (All Campaigns)</CardTitle>
              </CardHeader>
              <CardContent>
                {votesOverTime && votesOverTime.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={votesOverTime}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-50" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Line 
                        type="monotone" 
                        dataKey="cumulative" 
                        stroke="hsl(var(--primary))" 
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-48 flex items-center justify-center text-muted-foreground">
                    No vote data available
                  </div>
                )}
              </CardContent>
            </Card>
            
            <div>
              <h2 className="text-lg font-semibold mb-4">Campaign Overview</h2>
              {campaignsLoading ? (
                <div className="grid md:grid-cols-2 gap-4">
                  {[1, 2].map((i) => (
                    <Skeleton key={i} className="h-48" />
                  ))}
                </div>
              ) : campaigns && campaigns.length > 0 ? (
                <div className="grid md:grid-cols-2 gap-4">
                  {campaigns.map((campaign) => (
                    <div
                      key={campaign.id}
                      onClick={() => setSelectedCampaign(campaign.id)}
                      className="cursor-pointer"
                      data-testid={`card-campaign-${campaign.id}`}
                    >
                      <CampaignCard campaign={campaign} />
                    </div>
                  ))}
                </div>
              ) : (
                <Card className="border-card-border">
                  <CardContent className="py-8 text-center text-muted-foreground">
                    No campaigns found
                  </CardContent>
                </Card>
              )}
            </div>
            
            {selectedCampaign && (
              <div className="p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-sm">
                    Selected: <strong>{campaigns?.find(c => c.id === selectedCampaign)?.name}</strong>
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const tab = document.querySelector('[data-testid="tab-campaign"]');
                      if (tab) (tab as HTMLElement).click();
                    }}
                    data-testid="button-view-details"
                  >
                    View Details
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="campaign" className="space-y-6">
            <div className="flex items-center gap-4 mb-4">
              <Select value={selectedCampaign || ""} onValueChange={setSelectedCampaign}>
                <SelectTrigger className="w-64" data-testid="select-campaign">
                  <SelectValue placeholder="Select a campaign" />
                </SelectTrigger>
                <SelectContent>
                  {campaigns?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {selectedCampaign && (
              <Tabs defaultValue="votes" className="space-y-4">
                <TabsList>
                  <TabsTrigger value="votes">
                    <BarChart3 className="w-4 h-4 mr-2" />
                    Votes
                  </TabsTrigger>
                  <TabsTrigger value="reviewers">
                    <Users className="w-4 h-4 mr-2" />
                    Reviewers
                  </TabsTrigger>
                  <TabsTrigger value="disagreements">
                    <AlertTriangle className="w-4 h-4 mr-2" />
                    Disagreements
                  </TabsTrigger>
                  <TabsTrigger value="skips">
                    <SkipForward className="w-4 h-4 mr-2" />
                    Skips
                  </TabsTrigger>
                </TabsList>
                
                <TabsContent value="votes">
                  {votesLoading ? (
                    <Skeleton className="h-96" />
                  ) : voteDistribution ? (
                    <VoteDistributionSection data={voteDistribution} />
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">No data</div>
                  )}
                </TabsContent>
                
                <TabsContent value="reviewers">
                  {reviewersLoading ? (
                    <Skeleton className="h-96" />
                  ) : reviewerStats && reviewerStats.length > 0 ? (
                    <ReviewerStatsSection data={reviewerStats} />
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">No reviewers yet</div>
                  )}
                </TabsContent>
                
                <TabsContent value="disagreements">
                  {disagreementsLoading ? (
                    <Skeleton className="h-96" />
                  ) : disagreements ? (
                    <DisagreementSection data={disagreements} />
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">No data</div>
                  )}
                </TabsContent>
                
                <TabsContent value="skips">
                  {skipsLoading ? (
                    <Skeleton className="h-96" />
                  ) : skipAnalysis ? (
                    <SkipAnalysisSection data={skipAnalysis} />
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">No data</div>
                  )}
                </TabsContent>
              </Tabs>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
