import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
  ListFilter,
  Download,
  X,
} from "lucide-react";
import type { Campaign, Pair, Vote, User } from "@shared/schema";
import type { EvidenceStatus } from "@shared/campaignConfig";
import {
  EVIDENCE_TIER_META,
  EVIDENCE_TIER_ORDER,
  EvidenceStatusBadge,
  asEvidenceStatus,
} from "@/lib/evidenceTiers";

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

type DetailVote = Vote & {
  user: Pick<User, "id" | "email" | "displayName">;
};

type PairDetails = {
  pair: Pair;
  votes: DetailVote[];
  skipCount: number;
};

/**
 * Renders a pair's jsonb metadata as badges. Values are rendered as React text
 * nodes (never HTML) — imported metadata can contain XSS payloads like
 * `<img onerror=...>` / `<script>` and must stay inert.
 */
function MetadataBadges({ metadata }: { metadata: unknown }) {
  if (!metadata || typeof metadata !== "object") return null;
  const entries = Object.entries(metadata as Record<string, unknown>).filter(
    ([, v]) => v !== "" && v != null,
  );
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-2">
      {entries.map(([key, value]) => (
        <Badge
          key={key}
          variant="secondary"
          className="text-xs max-w-full break-words whitespace-normal font-normal"
        >
          {key}: {String(value)}
        </Badge>
      ))}
    </div>
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

/** A single vote in the supersession chain. Superseded votes are de-emphasized. */
function VoteRow({ vote, superseded }: { vote: DetailVote; superseded: boolean }) {
  return (
    <TableRow
      className={superseded ? "opacity-50" : undefined}
      data-testid={`row-vote-${vote.id}`}
    >
      <TableCell className="text-sm">
        <div className="flex items-center gap-2">
          {vote.user.displayName || vote.user.email}
          {superseded && (
            <Badge variant="outline" className="text-[10px] px-1 py-0">
              Superseded
            </Badge>
          )}
        </div>
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
          <span className="font-mono">{vote.scoreNumeric}</span>
        )}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">{vote.scoringMode}</TableCell>
      <TableCell className="text-xs font-mono">{vote.expertSelectedCode || "-"}</TableCell>
      <TableCell className="text-xs max-w-32 truncate">{vote.reviewerNotes || "-"}</TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {new Date(vote.createdAt).toLocaleDateString()}
      </TableCell>
    </TableRow>
  );
}

/**
 * Resolve an admin-authored external link for a target id using the campaign's
 * config.display.linkTemplate. Returns null when links are disabled, no
 * template is configured, or the resulting URL is not https — in which case the
 * caller renders the id as plain text. The shared schema already constrains
 * linkTemplate to https:// + a {targetId} placeholder, but we re-validate the
 * produced URL defensively and encode the interpolated id.
 */
function resolveTargetLink(
  campaign: Campaign | undefined,
  targetId: string | null,
): string | null {
  const display = campaign?.config?.display;
  if (!display?.showExternalLinks || !display.linkTemplate || !targetId) {
    return null;
  }
  const url = display.linkTemplate.replace(
    /\{targetId\}/g,
    encodeURIComponent(targetId),
  );
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function PairDetailDialog({
  pairId,
  campaign,
  open,
  onClose,
}: {
  pairId: string | null;
  campaign: Campaign | undefined;
  open: boolean;
  onClose: () => void;
}) {
  const [showSuperseded, setShowSuperseded] = useState(false);

  const { data, isLoading } = useQuery<PairDetails>({
    queryKey: ["/api/pairs", pairId, "details"],
    queryFn: async () => {
      const res = await fetch(`/api/pairs/${pairId}/details`);
      if (!res.ok) throw new Error("Failed to fetch pair details");
      return res.json();
    },
    enabled: !!pairId && open,
  });

  const targetLink = resolveTargetLink(campaign, data?.pair.targetId ?? null);

  const allVotes = data?.votes ?? [];
  const activeVotes = allVotes.filter((v) => v.isActive !== false);
  const supersededVotes = allVotes.filter((v) => v.isActive === false);
  // Collapse superseded votes by default only when the chain is long (>=3 total).
  const collapseSuperseded = allVotes.length >= 3 && supersededVotes.length > 0;
  const supersededVisible = !collapseSuperseded || showSuperseded;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Pair Details
            {data && <EvidenceStatusBadge status={data.pair.evidenceStatus} />}
          </DialogTitle>
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
                <MetadataBadges metadata={data.pair.sourceMetadata} />
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground mb-1">TARGET</p>
                <p className="text-sm font-medium mb-2">{data.pair.targetDataset}</p>
                <p className="text-sm">{data.pair.targetText || "(No match)"}</p>
                <p className="text-xs font-mono text-muted-foreground mt-2">
                  ID:{" "}
                  {targetLink ? (
                    <a
                      href={targetLink}
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
                <MetadataBadges metadata={data.pair.targetMetadata} />
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
                  Votes ({activeVotes.length} active
                  {supersededVotes.length > 0
                    ? `, ${supersededVotes.length} superseded`
                    : ""}
                  ) | Skips ({data.skipCount})
                </p>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="text-green-600">
                    {activeVotes.filter((v) => v.scoreBinary === "match").length} positive
                  </span>
                  <span className="text-red-600">
                    {activeVotes.filter((v) => v.scoreBinary === "no_match").length} negative
                  </span>
                  <span className="text-yellow-600">
                    {activeVotes.filter((v) => v.scoreBinary === "unsure").length} unsure
                  </span>
                </div>
              </div>
              {allVotes.length > 0 ? (
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
                    {activeVotes.map((vote) => (
                      <VoteRow key={vote.id} vote={vote} superseded={false} />
                    ))}
                    {collapseSuperseded && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={6} className="py-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs text-muted-foreground"
                            onClick={() => setShowSuperseded((s) => !s)}
                            data-testid="button-toggle-superseded"
                          >
                            {showSuperseded ? (
                              <ChevronUp className="w-3 h-3 mr-1" />
                            ) : (
                              <ChevronDown className="w-3 h-3 mr-1" />
                            )}
                            {showSuperseded ? "Hide" : "Show"} {supersededVotes.length}{" "}
                            prior vote{supersededVotes.length === 1 ? "" : "s"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    )}
                    {supersededVisible &&
                      supersededVotes.map((vote) => (
                        <VoteRow key={vote.id} vote={vote} superseded />
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
  const [exportFormat, setExportFormat] = useState<"csv" | "tsv" | "json">("csv");
  const [isExporting, setIsExporting] = useState(false);

  // Multi-select evidence-tier filter, initialized from the URL so a filtered
  // view is shareable. Filtering is applied client-side over the loaded page
  // (see filteredPairs) — no client-side consensus recompute.
  const [evidenceFilter, setEvidenceFilter] = useState<EvidenceStatus[]>(() => {
    const raw = new URLSearchParams(window.location.search).get("evidence");
    if (!raw) return [];
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter((s): s is EvidenceStatus =>
        (EVIDENCE_TIER_ORDER as string[]).includes(s),
      );
  });

  // Reflect the selected statuses in the URL query params (shareable view).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (evidenceFilter.length > 0) {
      params.set("evidence", evidenceFilter.join(","));
    } else {
      params.delete("evidence");
    }
    const qs = params.toString();
    const next = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
    window.history.replaceState(null, "", next);
  }, [evidenceFilter]);

  const toggleEvidence = (status: EvidenceStatus) => {
    setEvidenceFilter((prev) =>
      prev.includes(status)
        ? prev.filter((s) => s !== status)
        : [...prev, status],
    );
  };

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

  // Client-side evidence-tier filter over the loaded page (multi-select).
  const filteredPairs = useMemo(() => {
    if (evidenceFilter.length === 0) return sortedPairs;
    return sortedPairs.filter((row) =>
      evidenceFilter.includes(asEvidenceStatus(row.pair.evidenceStatus)),
    );
  }, [sortedPairs, evidenceFilter]);

  // Distinguish "filter hides everything" from "campaign has no pairs at all".
  const hasLoadedPairs = !!results && results.pairs.length > 0;
  const filterHidAll =
    hasLoadedPairs && filteredPairs.length === 0 && evidenceFilter.length > 0;

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

  // All formats (csv/tsv/json) are served by the single server-side serializer
  // — the client no longer hand-rolls JSON (which used to drop evidence_status,
  // resolution_layer, unsure_votes, etc). Exports are always the whole campaign.
  const handleExport = async () => {
    if (!campaignId) return;
    setIsExporting(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/export?format=${exportFormat}`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${campaign?.name?.replace(/\s+/g, "_") ?? "export"}_export.${exportFormat}`;
      a.click();
      URL.revokeObjectURL(url);
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
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="gap-2"
                    data-testid="button-evidence-filter"
                  >
                    <ListFilter className="w-4 h-4" />
                    Evidence status
                    {evidenceFilter.length > 0 && (
                      <Badge variant="secondary" className="ml-1">
                        {evidenceFilter.length}
                      </Badge>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56" align="start">
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      Filter by evidence status
                    </p>
                    {EVIDENCE_TIER_ORDER.map((status) => {
                      const meta = EVIDENCE_TIER_META[status];
                      const Icon = meta.icon;
                      return (
                        <label
                          key={status}
                          className="flex items-center gap-2 text-sm cursor-pointer"
                          data-testid={`checkbox-evidence-${status}`}
                        >
                          <Checkbox
                            checked={evidenceFilter.includes(status)}
                            onCheckedChange={() => toggleEvidence(status)}
                          />
                          <Icon className="w-3.5 h-3.5" />
                          {meta.label}
                        </label>
                      );
                    })}
                    {evidenceFilter.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start text-xs"
                        onClick={() => setEvidenceFilter([])}
                        data-testid="button-clear-evidence"
                      >
                        <X className="w-3 h-3 mr-1" />
                        Clear
                      </Button>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
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
            ) : filterHidAll ? (
              <div className="p-12 text-center text-muted-foreground space-y-3">
                <p>
                  No pairs with status{" "}
                  <span className="font-medium">
                    {evidenceFilter
                      .map((s) => EVIDENCE_TIER_META[s].label)
                      .join(", ")}
                  </span>{" "}
                  on this page — adjust the filter.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEvidenceFilter([])}
                  data-testid="button-clear-evidence-empty"
                >
                  <X className="w-3 h-3 mr-1" />
                  Clear filter
                </Button>
              </div>
            ) : hasLoadedPairs ? (
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
                    {filteredPairs.map((row) => (
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
                          {/* reject / unsure / accept — matches the review buttons
                              (No Match · Unsure · Match). Unsure is derived since
                              /results returns only positive/negative counts. */}
                          <div
                            className="flex items-center justify-center gap-1 text-sm tabular-nums"
                            title="reject / unsure / accept"
                          >
                            <span className="text-red-600">{row.negativeVotes}</span>
                            <span className="text-muted-foreground">/</span>
                            <span className="text-foreground">
                              {Math.max(0, row.voteCount - row.positiveVotes - row.negativeVotes)}
                            </span>
                            <span className="text-muted-foreground">/</span>
                            <span className="text-green-600">{row.positiveVotes}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center text-sm text-muted-foreground">
                          {row.skipCount}
                        </TableCell>
                        <TableCell>
                          <EvidenceStatusBadge status={row.pair.evidenceStatus} />
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
                    {evidenceFilter.length > 0 &&
                      ` (${filteredPairs.length} match the status filter on this page)`}
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
                This campaign has no pairs matching your search.
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-2">
          <Select
            value={exportFormat}
            onValueChange={(v) => setExportFormat(v as "csv" | "tsv" | "json")}
          >
            <SelectTrigger className="w-28" data-testid="select-export-format">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="csv">CSV</SelectItem>
              <SelectItem value="tsv">TSV</SelectItem>
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
        campaign={campaign}
        open={!!selectedPairId}
        onClose={() => setSelectedPairId(null)}
      />
    </div>
  );
}
