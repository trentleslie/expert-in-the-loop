import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  ThumbsUp,
  ThumbsDown,
  SkipForward,
  ArrowLeft,
  Keyboard,
  Zap,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ExternalLink,
  HelpCircle,
} from "lucide-react";
import type { Campaign, Pair } from "@shared/schema";

type NextPairResponse = {
  pair: Pair | null;
  progress: {
    reviewed: number;
    total: number;
  };
  sessionStats: {
    reviewCount: number;
    streak: number;
  };
};

function LoincLink({ code, className }: { code: string; className?: string }) {
  // Don't render as a link for special values like NO_MATCH
  if (!code || code === "NO_MATCH" || code.startsWith("NO_")) {
    return <span className={`font-mono ${className || ""}`}>{code}</span>;
  }
  const loincUrl = `https://loinc.org/${code}`;
  return (
    <a 
      href={loincUrl} 
      target="_blank" 
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1 text-primary hover:underline ${className || ""}`}
      data-testid={`link-loinc-${code}`}
    >
      {code}
      <ExternalLink className="w-3 h-3" />
    </a>
  );
}

type LoincAlternative = {
  code: string;
  name?: string;
  confidence?: number;
  vector_similarity?: number;
};

function parseTop5Loinc(value: unknown): LoincAlternative[] {
  if (!value) return [];
  try {
    if (typeof value === "string") {
      // Handle Python-style list string: "['code1', 'code2']" or JSON array
      const cleaned = value.replace(/'/g, '"');
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => {
          if (typeof item === "string") {
            return { code: item };
          }
          if (typeof item === "object" && item !== null && item.code) {
            return item as LoincAlternative;
          }
          return null;
        }).filter((item): item is LoincAlternative => item !== null);
      }
    }
    if (Array.isArray(value)) {
      return value.map((item) => {
        if (typeof item === "string") {
          return { code: item };
        }
        if (typeof item === "object" && item !== null && (item as any).code) {
          return item as LoincAlternative;
        }
        return null;
      }).filter((item): item is LoincAlternative => item !== null);
    }
  } catch {
    return [];
  }
  return [];
}

function EntityCard({
  type,
  text,
  dataset,
  id,
  metadata,
}: {
  type: "source" | "target";
  text: string;
  dataset: string;
  id: string;
  metadata?: Record<string, unknown> | null;
}) {
  const isLoinc = dataset.toUpperCase() === "LOINC";
  const top5Loinc = parseTop5Loinc(metadata?.top_5_loinc);
  
  // Filter out top_5_loinc from displayed metadata since we show it separately
  const displayMetadata = metadata 
    ? Object.entries(metadata).filter(([key]) => key !== "top_5_loinc").slice(0, 3)
    : [];

  return (
    <Card className="border-card-border h-full flex flex-col" data-testid={`card-entity-${type}`}>
      <CardHeader className="pb-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs font-medium uppercase tracking-wide" data-testid={`badge-entity-type-${type}`}>
            {type}
          </Badge>
          <span className="text-sm text-muted-foreground truncate" data-testid={`text-dataset-${type}`}>
            {dataset}
          </span>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col">
        <p className="text-lg text-foreground leading-relaxed flex-1" data-testid={`text-entity-${type}`}>
          {text}
        </p>
        <div className="mt-4 pt-3 border-t border-border space-y-2">
          <p className="text-sm font-mono text-muted-foreground" data-testid={`text-entity-id-${type}`}>
            ID: {isLoinc ? <LoincLink code={id} /> : id}
          </p>
          {displayMetadata.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {displayMetadata.map(([key, value]) => (
                <Badge key={key} variant="secondary" className="text-xs">
                  {key}: {String(value)}
                </Badge>
              ))}
            </div>
          )}
          {top5Loinc.length > 0 && (
            <div className="pt-2">
              <p className="text-xs text-muted-foreground mb-1">Alternative suggestions:</p>
              <div className="flex flex-col gap-1">
                {top5Loinc.map((alt) => (
                  <div key={alt.code} className="flex items-center gap-2 text-xs">
                    <LoincLink code={alt.code} className="font-mono shrink-0" />
                    {alt.name && (
                      <span className="text-muted-foreground truncate">{alt.name}</span>
                    )}
                    {alt.confidence !== undefined && (
                      <Badge variant="secondary" className="text-xs shrink-0">
                        {(alt.confidence * 100).toFixed(0)}%
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ConfidenceIndicator({ confidence, model }: { confidence: number | null; model: string | null }) {
  if (confidence === null) return null;

  const getConfidenceColor = (conf: number) => {
    if (conf >= 0.8) return "bg-green-500";
    if (conf >= 0.6) return "bg-yellow-500";
    return "bg-red-500";
  };

  return (
    <div className="flex items-center justify-center gap-4 py-4" data-testid="container-confidence">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">LLM Confidence:</span>
        <div className="flex items-center gap-2">
          <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full ${getConfidenceColor(confidence)} transition-all`}
              style={{ width: `${confidence * 100}%` }}
            />
          </div>
          <span className="text-sm font-mono font-medium" data-testid="text-confidence-value">
            {(confidence * 100).toFixed(0)}%
          </span>
        </div>
      </div>
      {model && (
        <span className="text-xs text-muted-foreground">
          ({model})
        </span>
      )}
    </div>
  );
}

function KeyboardShortcuts({ isNumericMode }: { isNumericMode: boolean }) {
  if (isNumericMode) {
    return (
      <div className="flex items-center justify-center gap-6 py-3 text-xs text-muted-foreground flex-wrap">
        <div className="flex items-center gap-1.5">
          <Keyboard className="w-3.5 h-3.5" />
          <span>Keyboard shortcuts:</span>
        </div>
        {[1, 2, 3, 4, 5].map((n) => (
          <div key={n} className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">{n}</kbd>
            <span>Score {n}</span>
          </div>
        ))}
        <div className="flex items-center gap-1">
          <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">↓</kbd>
          <span>Skip</span>
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex items-center justify-center gap-6 py-3 text-xs text-muted-foreground flex-wrap">
      <div className="flex items-center gap-1.5">
        <Keyboard className="w-3.5 h-3.5" />
        <span>Keyboard shortcuts:</span>
      </div>
      <div className="flex items-center gap-1">
        <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">←</kbd>
        <span>Reject</span>
      </div>
      <div className="flex items-center gap-1">
        <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">U</kbd>
        <span>Unsure</span>
      </div>
      <div className="flex items-center gap-1">
        <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">→</kbd>
        <span>Confirm</span>
      </div>
      <div className="flex items-center gap-1">
        <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">↓</kbd>
        <span>Skip</span>
      </div>
    </div>
  );
}

function SessionStats({ reviewCount, streak }: { reviewCount: number; streak: number }) {
  return (
    <div className="flex items-center gap-4 text-sm text-muted-foreground">
      <div className="flex items-center gap-1.5">
        <CheckCircle2 className="w-4 h-4" />
        <span data-testid="text-session-reviews">{reviewCount} reviews</span>
      </div>
      {streak > 1 && (
        <div className="flex items-center gap-1.5">
          <Zap className="w-4 h-4 text-yellow-500" />
          <span data-testid="text-session-streak">Streak: {streak}</span>
        </div>
      )}
    </div>
  );
}

export default function ReviewPage() {
  const { id: campaignId } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [sessionStats, setSessionStats] = useState({ reviewCount: 0, streak: 0 });
  const [expertSelectedCode, setExpertSelectedCode] = useState<string | null>(null);
  const [reviewerNotes, setReviewerNotes] = useState("");
  const [isNumericMode, setIsNumericMode] = useState(false);

  const { data: campaign } = useQuery<Campaign>({
    queryKey: [`/api/campaigns/${campaignId}`, "detail", campaignId],
    enabled: !!campaignId,
  });

  const { 
    data: pairData, 
    isLoading: pairLoading, 
    refetch: refetchPair,
    isError: pairError,
  } = useQuery<NextPairResponse>({
    queryKey: [`/api/campaigns/${campaignId}/next-pair`, "next-pair", campaignId],
    enabled: !!campaignId,
  });

  const voteMutation = useMutation({
    mutationFn: async ({ pairId, scoreBinary, scoreNumeric, expertCode, notes, scoringMode }: { 
      pairId: string; 
      scoreBinary: boolean | null;
      scoreNumeric: number | null;
      expertCode: string | null;
      notes: string;
      scoringMode: "binary" | "numeric";
    }) => {
      return apiRequest("POST", `/api/pairs/${pairId}/vote`, {
        scoreBinary,
        scoreNumeric,
        scoringMode,
        expertSelectedCode: expertCode,
        reviewerNotes: notes || null,
      });
    },
    onSuccess: () => {
      setSessionStats(prev => ({
        reviewCount: prev.reviewCount + 1,
        streak: prev.streak + 1,
      }));
      // Reset expert selection and notes for next pair
      setExpertSelectedCode(null);
      setReviewerNotes("");
      toast({
        title: "Vote recorded",
        description: "Moving to next pair...",
        duration: 1500,
      });
      refetchPair();
      queryClient.invalidateQueries({ queryKey: ["/api/users/me/stats"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to submit vote. Please try again.",
        variant: "destructive",
      });
    },
  });

  const skipMutation = useMutation({
    mutationFn: async (pairId: string) => {
      return apiRequest("POST", `/api/pairs/${pairId}/skip`, {});
    },
    onSuccess: () => {
      setSessionStats(prev => ({
        ...prev,
        streak: 0,
      }));
      // Reset expert selection and notes for next pair
      setExpertSelectedCode(null);
      setReviewerNotes("");
      refetchPair();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to skip pair. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleBinaryVote = useCallback((score: "match" | "no_match" | "unsure") => {
    if (pairData?.pair) {
      voteMutation.mutate({ 
        pairId: pairData.pair.id, 
        scoreBinary: score,
        scoreNumeric: null,
        scoringMode: "binary",
        expertCode: expertSelectedCode,
        notes: reviewerNotes,
      });
    }
  }, [pairData?.pair, voteMutation, expertSelectedCode, reviewerNotes]);

  const handleNumericVote = useCallback((score: number) => {
    if (pairData?.pair) {
      voteMutation.mutate({ 
        pairId: pairData.pair.id, 
        scoreBinary: null,
        scoreNumeric: score,
        scoringMode: "numeric",
        expertCode: expertSelectedCode,
        notes: reviewerNotes,
      });
    }
  }, [pairData?.pair, voteMutation, expertSelectedCode, reviewerNotes]);

  const handleSkip = useCallback(() => {
    if (pairData?.pair) {
      skipMutation.mutate(pairData.pair.id);
    }
  }, [pairData?.pair, skipMutation]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (voteMutation.isPending || skipMutation.isPending || !pairData?.pair) return;
      
      if (isNumericMode) {
        // Numeric mode: 1-5 keys for scoring
        const numKey = parseInt(e.key);
        if (numKey >= 1 && numKey <= 5) {
          e.preventDefault();
          handleNumericVote(numKey);
          return;
        }
      } else {
        // Binary mode: arrow keys and U for unsure
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          handleBinaryVote("no_match");
          return;
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          handleBinaryVote("match");
          return;
        } else if (e.key.toLowerCase() === "u") {
          e.preventDefault();
          handleBinaryVote("unsure");
          return;
        }
      }
      
      // Skip works in both modes
      if (e.key === "ArrowDown") {
        e.preventDefault();
        handleSkip();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleBinaryVote, handleNumericVote, handleSkip, voteMutation.isPending, skipMutation.isPending, pairData?.pair, isNumericMode]);

  const progress = pairData?.progress 
    ? Math.round((pairData.progress.reviewed / Math.max(pairData.progress.total, 1)) * 100)
    : 0;

  const isSubmitting = voteMutation.isPending || skipMutation.isPending;

  if (pairError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-md w-full border-card-border">
          <CardContent className="flex flex-col items-center py-12">
            <AlertCircle className="w-12 h-12 text-destructive mb-4" />
            <h2 className="text-lg font-medium text-foreground mb-2">
              Unable to Load Review
            </h2>
            <p className="text-sm text-muted-foreground text-center mb-4">
              There was an error loading the review interface. Please try again.
            </p>
            <Button onClick={() => refetchPair()} data-testid="button-retry">
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation("/")}
              data-testid="button-back-home"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-xl font-semibold text-foreground" data-testid="text-campaign-title">
                {campaign?.name || "Review Campaign"}
              </h1>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-sm text-muted-foreground" data-testid="text-progress">
                  Progress: {pairData?.progress?.reviewed || 0}/{pairData?.progress?.total || 0} pairs
                </span>
                <span className="text-sm text-muted-foreground" data-testid="text-progress-percent">({progress}%)</span>
              </div>
            </div>
          </div>
          <SessionStats 
            reviewCount={sessionStats.reviewCount} 
            streak={sessionStats.streak} 
          />
        </div>

        {/* Progress bar */}
        <Progress value={progress} className="h-2" />

        {pairLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
        ) : !pairData?.pair ? (
          <Card className="border-card-border">
            <CardContent className="flex flex-col items-center py-16">
              <div className="p-4 rounded-full bg-green-500/10 mb-4">
                <CheckCircle2 className="w-10 h-10 text-green-600 dark:text-green-400" />
              </div>
              <h2 className="text-xl font-semibold text-foreground mb-2">
                All Caught Up!
              </h2>
              <p className="text-muted-foreground text-center max-w-md mb-6">
                You've reviewed all available pairs in this campaign. 
                Check back later for more or explore other campaigns.
              </p>
              <Button onClick={() => setLocation("/")} data-testid="button-back-to-campaigns">
                Back to Campaigns
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Entity comparison */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <EntityCard
                type="source"
                text={pairData.pair.sourceText}
                dataset={pairData.pair.sourceDataset}
                id={pairData.pair.sourceId}
                metadata={pairData.pair.sourceMetadata as Record<string, unknown> | null}
              />
              <EntityCard
                type="target"
                text={pairData.pair.targetText}
                dataset={pairData.pair.targetDataset}
                id={pairData.pair.targetId}
                metadata={pairData.pair.targetMetadata as Record<string, unknown> | null}
              />
            </div>

            {/* Confidence indicator */}
            <ConfidenceIndicator
              confidence={pairData.pair.llmConfidence}
              model={pairData.pair.llmModel}
            />

            {/* Expert selection and notes */}
            <Card className="border-card-border">
              <CardContent className="p-4 space-y-4">
                {/* Expert alternative selection */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    Suggest alternative match (optional)
                  </label>
                  <Select
                    value={expertSelectedCode || "none"}
                    onValueChange={(value) => setExpertSelectedCode(value === "none" ? null : value)}
                  >
                    <SelectTrigger data-testid="select-expert-code">
                      <SelectValue placeholder="Select from alternatives..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None (use AI suggestion)</SelectItem>
                      {parseTop5Loinc(pairData.pair.targetMetadata?.top_5_loinc).map((alt) => (
                        <SelectItem key={alt.code} value={alt.code}>
                          <span className="flex items-center gap-2">
                            <span className="font-mono">{alt.code}</span>
                            {alt.name && <span className="text-muted-foreground text-xs truncate max-w-48">{alt.name}</span>}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    If the AI's suggestion isn't correct, select a better match from the alternatives
                  </p>
                </div>

                {/* Notes field */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    Reviewer notes (optional)
                  </label>
                  <Textarea
                    placeholder="Add any notes about your decision..."
                    value={reviewerNotes}
                    onChange={(e) => setReviewerNotes(e.target.value)}
                    className="resize-none"
                    rows={2}
                    maxLength={500}
                    data-testid="input-reviewer-notes"
                  />
                  <p className="text-xs text-muted-foreground text-right">
                    {reviewerNotes.length}/500
                  </p>
                </div>
              </CardContent>
            </Card>

            <Separator />

            {/* Scoring mode toggle */}
            <div className="flex items-center justify-center gap-4">
              <Label htmlFor="scoring-mode" className="text-sm text-muted-foreground">
                Binary Mode
              </Label>
              <Switch
                id="scoring-mode"
                checked={isNumericMode}
                onCheckedChange={setIsNumericMode}
                data-testid="switch-scoring-mode"
              />
              <Label htmlFor="scoring-mode" className="text-sm text-muted-foreground">
                Numeric Mode (1-5)
              </Label>
            </div>

            {/* Voting buttons */}
            <div className="space-y-4">
              {isNumericMode ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-center gap-2">
                    {[1, 2, 3, 4, 5].map((score) => (
                      <Button
                        key={score}
                        size="lg"
                        variant={score >= 4 ? "default" : score <= 2 ? "outline" : "secondary"}
                        className="h-14 w-14 text-lg font-semibold"
                        onClick={() => handleNumericVote(score)}
                        disabled={isSubmitting}
                        data-testid={`button-score-${score}`}
                      >
                        {isSubmitting ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          score
                        )}
                      </Button>
                    ))}
                  </div>
                  <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
                    <span>1 = Unrelated</span>
                    <span>2 = Tangential</span>
                    <span>3 = Similar</span>
                    <span>4 = Strong</span>
                    <span>5 = Exact</span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-3 flex-wrap">
                  <Button
                    size="lg"
                    variant="outline"
                    className="h-14 px-6 gap-2"
                    onClick={() => handleBinaryVote("no_match")}
                    disabled={isSubmitting}
                    data-testid="button-no-match"
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <ThumbsDown className="w-5 h-5" />
                    )}
                    Reject
                  </Button>
                  <Button
                    size="lg"
                    variant="secondary"
                    className="h-14 px-6 gap-2"
                    onClick={() => handleBinaryVote("unsure")}
                    disabled={isSubmitting}
                    data-testid="button-unsure"
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <HelpCircle className="w-5 h-5" />
                    )}
                    Unsure
                  </Button>
                  <Button
                    size="lg"
                    className="h-14 px-6 gap-2"
                    onClick={() => handleBinaryVote("match")}
                    disabled={isSubmitting}
                    data-testid="button-yes-match"
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <ThumbsUp className="w-5 h-5" />
                    )}
                    Confirm
                  </Button>
                </div>
              )}

              <div className="flex justify-center">
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2 text-muted-foreground"
                  onClick={handleSkip}
                  disabled={isSubmitting}
                  data-testid="button-skip"
                >
                  <SkipForward className="w-4 h-4" />
                  Skip
                </Button>
              </div>
            </div>

            {/* Keyboard shortcuts */}
            <KeyboardShortcuts isNumericMode={isNumericMode} />
          </>
        )}
      </div>
    </div>
  );
}
