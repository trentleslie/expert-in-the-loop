import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  ChevronUp,
  ChevronDown,
  ExternalLink,
  ThumbsUp,
  ThumbsDown,
  HelpCircle,
  AlertTriangle,
  Minus,
  Download,
} from "lucide-react";
import type { Campaign, Pair, Vote, User } from "@shared/schema";

type SortField = "sourceText" | "targetText" | "voteCount" | "positiveRate" | null;
type SortDirection = "asc" | "desc";

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

function SortIcon({
  field,
  sortField,
  sortDirection,
}: {
  field: SortField;
  sortField: SortField;
  sortDirection: SortDirection;
}) {
  if (sortField !== field) {
    return <ChevronDown className="w-3 h-3 opacity-30" />;
  }
  return sortDirection === "asc" ? (
    <ChevronUp className="w-3 h-3 opacity-80" />
  ) : (
    <ChevronDown className="w-3 h-3 opacity-80" />
  );
}

function SortableHead({
  field,
  sortField,
  sortDirection,
  onSort,
  className,
  children,
}: {
  field: SortField;
  sortField: SortField;
  sortDirection: SortDirection;
  onSort: (field: SortField) => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <TableHead
      className={`cursor-pointer select-none hover:text-foreground ${className ?? ""}`}
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        <SortIcon field={field} sortField={sortField} sortDirection={sortDirection} />
      </span>
    </TableHead>
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
  const [minVotesInput, setMinVotesInput] = useState("");
  const [maxVotesInput, setMaxVotesInput] = useState("");
  const [minVotes, setMinVotes] = useState<number | undefined>(undefined);
  const [maxVotes, setMaxVotes] = useState<number | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [selectedPairId, setSelectedPairId] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [exportFormat, setExportFormat] = useState<"csv" | "json">("csv");
  const [isExporting, setIsExporting] = useState(false);

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
    queryKey: ["/api/campaigns", campaignId, "results", { page, search, consensus, minVotes, maxVotes }],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "25",
      });
      if (search) params.set("search", search);
      if (consensus !== "all") params.set("consensus", consensus);
      if (minVotes !== undefined) params.set("minVotes", minVotes.toString());
      if (maxVotes !== undefined) params.set("maxVotes", maxVotes.toString());

      const res = await fetch(`/api/campaigns/${campaignId}/results?${params}`);
      if (!res.ok) throw new Error("Failed to fetch results");
      return res.json();
    },
    enabled: !!campaignId,
  });

  const sortedPairs = useMemo(() => {
    if (!results?.pairs) return [];
    if (!sortField) return results.pairs;

    return [...results.pairs].sort((a, b) => {
      let aVal: string | number | null;
      let bVal: string | number | null;

      switch (sortField) {
        case "sourceText":
          aVal = a.pair.sourceText ?? "";
          bVal = b.pair.sourceText ?? "";
          break;
        case "targetText":
          aVal = a.pair.targetText ?? "";
          bVal = b.pair.targetText ?? "";
          break;
        case "voteCount":
          aVal = a.voteCount;
          bVal = b.voteCount;
          break;
        case "positiveRate":
          aVal = a.positiveRate ?? -1;
          bVal = b.positiveRate ?? -1;
          break;
        default:
          return 0;
      }

      if (typeof aVal === "string" && typeof bVal === "string") {
        const cmp = aVal.localeCompare(bVal);
        return sortDirection === "asc" ? cmp : -cmp;
      }

      const cmp = (aVal as number) - (bVal as number);
      return sortDirection === "asc" ? cmp : -cmp;
    });
  }, [results?.pairs, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const handleSearch = () => {
    setSearch(searchInput);
    const parsedMin = minVotesInput !== "" ? parseInt(minVotesInput, 10) : undefined;
    const parsedMax = maxVotesInput !== "" ? parseInt(maxVotesInput, 10) : undefined;
    setMinVotes(isNaN(parsedMin as number) ? undefined : parsedMin);
    setMaxVotes(isNaN(parsedMax as number) ? undefined : parsedMax);
    setPage(1);
  };

  const handleExport = async () => {
    if (!campaignId) return;
    setIsExporting(true);
    try {
      if (exportFormat === "csv") {
        const res = await fetch(`/api/campaigns/${campaignId}/export`);
        if (!res.ok) throw new Error("Export failed");
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${campaign?.name?.replace(/\s+/g, "_") ?? "export"}_export.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const allPairs: PairResult[] = [];
        let currentPage = 1;
        let totalPages = 1;
        do {
          const params = new URLSearchParams({ page: currentPage.toString(), limit: "100" });
          if (search) params.set("search", search);
          if (consensus !== "all") params.set("consensus", consensus);
          if (minVotes !== undefined) params.set("minVotes", minVotes.toString());
          if (maxVotes !== undefined) params.set("maxVotes", maxVotes.toString());
          const res = await fetch(`/api/campaigns/${campaignId}/results?${params}`);
          if (!res.ok) throw new Error("Failed to fetch results for JSON export");
          const data: ResultsResponse = await res.json();
          allPairs.push(...data.pairs);
          totalPages = data.totalPages;
          currentPage++;
        } while (currentPage <= totalPages);

        const jsonContent = JSON.stringify(
          {
            campaign: campaign?.name ?? campaignId,
            exportedAt: new Date().toISOString(),
            total: allPairs.length,
            pairs: allPairs.map((row) => ({
              pair_id: row.pair.id,
              source_text: row.pair.sourceText,
              source_dataset: row.pair.sourceDataset,
              source_id: row.pair.sourceId,
              target_text: row.pair.targetText,
              target_dataset: row.pair.targetDataset,
              target_id: row.pair.targetId,
              llm_confidence: row.pair.llmConfidence,
              llm_model: row.pair.llmModel,
              vote_count: row.voteCount,
              positive_votes: row.positiveVotes,
              negative_votes: row.negativeVotes,
              positive_rate: row.positiveRate,
            })),
          },
          null,
          2
        );
        const blob = new Blob([jsonContent], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${campaign?.name?.replace(/\s+/g, "_") ?? "export"}_export.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error("Export error:", err);
    } finally {
      setIsExporting(false);
    }
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
              <div className="flex items-center gap-2">
                <Label htmlFor="min-votes" className="text-sm text-muted-foreground whitespace-nowrap">
                  Min votes
                </Label>
                <Input
                  id="min-votes"
                  type="number"
                  min={0}
                  placeholder="0"
                  value={minVotesInput}
                  onChange={(e) => setMinVotesInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  className="w-20"
                  data-testid="input-min-votes"
                />
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="max-votes" className="text-sm text-muted-foreground whitespace-nowrap">
                  Max votes
                </Label>
                <Input
                  id="max-votes"
                  type="number"
                  min={0}
                  placeholder="any"
                  value={maxVotesInput}
                  onChange={(e) => setMaxVotesInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  className="w-20"
                  data-testid="input-max-votes"
                />
              </div>
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
                      <SortableHead
                        field="sourceText"
                        sortField={sortField}
                        sortDirection={sortDirection}
                        onSort={handleSort}
                        className="w-[40%]"
                      >
                        Source
                      </SortableHead>
                      <SortableHead
                        field="targetText"
                        sortField={sortField}
                        sortDirection={sortDirection}
                        onSort={handleSort}
                        className="w-[30%]"
                      >
                        Target
                      </SortableHead>
                      <SortableHead
                        field="voteCount"
                        sortField={sortField}
                        sortDirection={sortDirection}
                        onSort={handleSort}
                        className="text-center"
                      >
                        Votes
                      </SortableHead>
                      <TableHead className="text-center">Skips</TableHead>
                      <TableHead>Consensus</TableHead>
                      <SortableHead
                        field="positiveRate"
                        sortField={sortField}
                        sortDirection={sortDirection}
                        onSort={handleSort}
                        className="text-right"
                      >
                        Agreement
                      </SortableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedPairs.map((row) => (
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

        <div className="flex items-center justify-end gap-2">
          <Select
            value={exportFormat}
            onValueChange={(v) => setExportFormat(v as "csv" | "json")}
          >
            <SelectTrigger className="w-28" data-testid="select-export-format">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="csv">CSV</SelectItem>
              <SelectItem value="json">JSON</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={isExporting}
            data-testid="button-export"
          >
            <Download className="w-4 h-4 mr-2" />
            {isExporting ? "Exporting..." : `Export ${exportFormat.toUpperCase()}`}
          </Button>
        </div>
      </div>

      <PairDetailDialog
        pairId={selectedPairId}
        open={!!selectedPairId}
        onClose={() => setSelectedPairId(null)}
      />
    </div>
  );
}
