import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Search,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  ThumbsUp,
  ThumbsDown,
  HelpCircle,
  AlertTriangle,
  Minus,
} from "lucide-react";
import type { Campaign, Pair, Vote, User } from "@shared/schema";

type PairResult = {
  pair: Pair;
  voteCount: number;
  positiveVotes: number;
  negativeVotes: number;
  skipCount: number;
  positiveRate: number | null;
};

type ResultsResponse = {
  pairs: PairResult[];
  total: number;
  page: number;
  totalPages: number;
};

type PairDetails = {
  pair: Pair;
  votes: (Vote & { user: Pick<User, "id" | "email" | "displayName"> })[];
  skipCount: number;
};

function ConsensusIndicator({ rate }: { rate: number | null }) {
  if (rate === null) {
    return (
      <Badge variant="outline" className="gap-1">
        <Minus className="w-3 h-3" />
        Unreviewed
      </Badge>
    );
  }
  if (rate > 0.6) {
    return (
      <Badge className="gap-1 bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20">
        <ThumbsUp className="w-3 h-3" />
        Confirmed
      </Badge>
    );
  }
  if (rate < 0.4) {
    return (
      <Badge className="gap-1 bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20">
        <ThumbsDown className="w-3 h-3" />
        Rejected
      </Badge>
    );
  }
  return (
    <Badge className="gap-1 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20">
      <AlertTriangle className="w-3 h-3" />
      Disagreement
    </Badge>
  );
}

function PairDetailDialog({
  pairId,
  open,
  onClose,
}: {
  pairId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery<PairDetails>({
    queryKey: ["/api/pairs", pairId, "details"],
    queryFn: async () => {
      const res = await fetch(`/api/pairs/${pairId}/details`);
      if (!res.ok) throw new Error("Failed to fetch pair details");
      return res.json();
    },
    enabled: !!pairId && open,
  });

  const isLoinc = data?.pair.targetDataset?.toUpperCase() === "LOINC";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Pair Details</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-32" />
          </div>
        ) : data ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground mb-1">SOURCE</p>
                <p className="text-sm font-medium mb-2">{data.pair.sourceDataset}</p>
                <p className="text-sm">{data.pair.sourceText}</p>
                <p className="text-xs font-mono text-muted-foreground mt-2">
                  ID: {data.pair.sourceId}
                </p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground mb-1">TARGET</p>
                <p className="text-sm font-medium mb-2">{data.pair.targetDataset}</p>
                <p className="text-sm">{data.pair.targetText || "(No match)"}</p>
                <p className="text-xs font-mono text-muted-foreground mt-2">
                  ID:{" "}
                  {isLoinc ? (
                    <a
                      href={`https://loinc.org/${data.pair.targetId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline inline-flex items-center gap-1"
                    >
                      {data.pair.targetId}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    data.pair.targetId
                  )}
                </p>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground mb-2">LLM INFO</p>
              <div className="flex items-center gap-4 text-sm">
                <span>Confidence: {data.pair.llmConfidence ? `${(data.pair.llmConfidence * 100).toFixed(0)}%` : "N/A"}</span>
                {data.pair.llmModel && <span className="text-muted-foreground">Model: {data.pair.llmModel}</span>}
              </div>
              {data.pair.llmReasoning && (
                <p className="text-sm text-muted-foreground mt-2 italic">
                  {data.pair.llmReasoning}
                </p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium">
                  Votes ({data.votes.length}) | Skips ({data.skipCount})
                </p>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="text-green-600">
                    {data.votes.filter(v => v.scoreBinary === "match").length} positive
                  </span>
                  <span className="text-red-600">
                    {data.votes.filter(v => v.scoreBinary === "no_match").length} negative
                  </span>
                  <span className="text-yellow-600">
                    {data.votes.filter(v => v.scoreBinary === "unsure").length} unsure
                  </span>
                </div>
              </div>
              {data.votes.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Reviewer</TableHead>
                      <TableHead>Vote</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Expert Pick</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead>Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.votes.map((vote) => (
                      <TableRow key={vote.id}>
                        <TableCell className="text-sm">
                          {vote.user.displayName || vote.user.email}
                        </TableCell>
                        <TableCell>
                          {vote.scoringMode === "binary" ? (
                            vote.scoreBinary === "match" ? (
                              <ThumbsUp className="w-4 h-4 text-green-600" />
                            ) : vote.scoreBinary === "unsure" ? (
                              <HelpCircle className="w-4 h-4 text-yellow-600" />
                            ) : (
                              <ThumbsDown className="w-4 h-4 text-red-600" />
                            )
                          ) : (
                            <span className="font-mono">{vote.scoreNumeric}/5</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {vote.scoringMode}
                        </TableCell>
                        <TableCell className="text-xs font-mono">
                          {vote.expertSelectedCode || "-"}
                        </TableCell>
                        <TableCell className="text-xs max-w-32 truncate">
                          {vote.reviewerNotes || "-"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(vote.createdAt).toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground">No votes yet.</p>
              )}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export default function ResultsBrowserPage() {
  const { id: campaignId } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [consensus, setConsensus] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [selectedPairId, setSelectedPairId] = useState<string | null>(null);

  const { data: campaign } = useQuery<Campaign>({
    queryKey: ["/api/campaigns", campaignId],
    queryFn: async () => {
      const res = await fetch(`/api/campaigns/${campaignId}`);
      if (!res.ok) throw new Error("Failed to fetch campaign");
      return res.json();
    },
    enabled: !!campaignId,
  });

  const { data: results, isLoading } = useQuery<ResultsResponse>({
    queryKey: ["/api/campaigns", campaignId, "results", { page, search, consensus }],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "25",
      });
      if (search) params.set("search", search);
      if (consensus !== "all") params.set("consensus", consensus);

      const res = await fetch(`/api/campaigns/${campaignId}/results?${params}`);
      if (!res.ok) throw new Error("Failed to fetch results");
      return res.json();
    },
    enabled: !!campaignId,
  });

  const handleSearch = () => {
    setSearch(searchInput);
    setPage(1);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/admin/campaigns")}
            data-testid="button-back"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              Results Browser
            </h1>
            <p className="text-sm text-muted-foreground">
              {campaign?.name || "Loading..."}
            </p>
          </div>
        </div>

        <Card className="border-card-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-64">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search source or target text..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    className="pl-9"
                    data-testid="input-search"
                  />
                </div>
              </div>
              <Select value={consensus} onValueChange={(v) => { setConsensus(v); setPage(1); }}>
                <SelectTrigger className="w-40" data-testid="select-consensus">
                  <SelectValue placeholder="Consensus" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="match">Confirmed</SelectItem>
                  <SelectItem value="no_match">Rejected</SelectItem>
                  <SelectItem value="disagreement">Disagreement</SelectItem>
                  <SelectItem value="unreviewed">Unreviewed</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={handleSearch} data-testid="button-search">
                Search
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-card-border">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-12" />
                ))}
              </div>
            ) : results && results.pairs.length > 0 ? (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40%]">Source</TableHead>
                      <TableHead className="w-[30%]">Target</TableHead>
                      <TableHead className="text-center">Votes</TableHead>
                      <TableHead className="text-center">Skips</TableHead>
                      <TableHead>Consensus</TableHead>
                      <TableHead className="text-right">Agreement</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.pairs.map((row) => (
                      <TableRow
                        key={row.pair.id}
                        className="cursor-pointer hover-elevate"
                        onClick={() => setSelectedPairId(row.pair.id)}
                        data-testid={`row-pair-${row.pair.id}`}
                      >
                        <TableCell className="max-w-xs">
                          <p className="text-sm line-clamp-2">{row.pair.sourceText}</p>
                          <p className="text-xs font-mono text-muted-foreground mt-1">
                            {row.pair.sourceId}
                          </p>
                        </TableCell>
                        <TableCell className="max-w-xs">
                          <p className="text-sm line-clamp-2">{row.pair.targetText || "(No match)"}</p>
                          <p className="text-xs font-mono text-muted-foreground mt-1">
                            {row.pair.targetId}
                          </p>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1 text-sm">
                            <span className="text-green-600">{row.positiveVotes}</span>
                            <span>/</span>
                            <span className="text-red-600">{row.negativeVotes}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center text-sm text-muted-foreground">
                          {row.skipCount}
                        </TableCell>
                        <TableCell>
                          <ConsensusIndicator rate={row.positiveRate} />
                        </TableCell>
                        <TableCell className="text-right text-sm font-mono">
                          {row.positiveRate !== null
                            ? `${(row.positiveRate * 100).toFixed(0)}%`
                            : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                <div className="flex items-center justify-between p-4 border-t border-border">
                  <p className="text-sm text-muted-foreground">
                    Showing {(page - 1) * 25 + 1}-{Math.min(page * 25, results.total)} of{" "}
                    {results.total} pairs
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page === 1}
                      onClick={() => setPage(page - 1)}
                      data-testid="button-prev-page"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Previous
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Page {page} of {results.totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= results.totalPages}
                      onClick={() => setPage(page + 1)}
                      data-testid="button-next-page"
                    >
                      Next
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="p-12 text-center text-muted-foreground">
                No pairs found matching your filters.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <PairDetailDialog
        pairId={selectedPairId}
        open={!!selectedPairId}
        onClose={() => setSelectedPairId(null)}
      />
    </div>
  );
}
