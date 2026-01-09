import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  ThumbsUp,
  ThumbsDown,
  SkipForward,
  ArrowLeft,
  Keyboard,
  Settings,
  Zap,
  CheckCircle2,
  AlertCircle,
  Loader2,
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
  return (
    <Card className="border-card-border h-full flex flex-col">
      <CardHeader className="pb-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs font-medium uppercase tracking-wide">
            {type}
          </Badge>
          <span className="text-sm text-muted-foreground truncate">
            {dataset}
          </span>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col">
        <p className="text-lg text-foreground leading-relaxed flex-1">
          {text}
        </p>
        <div className="mt-4 pt-3 border-t border-border">
          <p className="text-sm font-mono text-muted-foreground">
            ID: {id}
          </p>
          {metadata && Object.keys(metadata).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {Object.entries(metadata).slice(0, 3).map(([key, value]) => (
                <Badge key={key} variant="secondary" className="text-xs">
                  {key}: {String(value)}
                </Badge>
              ))}
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
    <div className="flex items-center justify-center gap-4 py-4">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">LLM Confidence:</span>
        <div className="flex items-center gap-2">
          <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full ${getConfidenceColor(confidence)} transition-all`}
              style={{ width: `${confidence * 100}%` }}
            />
          </div>
          <span className="text-sm font-mono font-medium">
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

function KeyboardShortcuts() {
  return (
    <div className="flex items-center justify-center gap-6 py-3 text-xs text-muted-foreground">
      <div className="flex items-center gap-1.5">
        <Keyboard className="w-3.5 h-3.5" />
        <span>Keyboard shortcuts:</span>
      </div>
      <div className="flex items-center gap-1">
        <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">←</kbd>
        <span>No Match</span>
      </div>
      <div className="flex items-center gap-1">
        <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">→</kbd>
        <span>Yes Match</span>
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
        <span>{reviewCount} reviews</span>
      </div>
      {streak > 1 && (
        <div className="flex items-center gap-1.5">
          <Zap className="w-4 h-4 text-yellow-500" />
          <span>Streak: {streak}</span>
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

  const { data: campaign } = useQuery<Campaign>({
    queryKey: ["/api/campaigns", campaignId],
    enabled: !!campaignId,
  });

  const { 
    data: pairData, 
    isLoading: pairLoading, 
    refetch: refetchPair,
    isError: pairError,
  } = useQuery<NextPairResponse>({
    queryKey: ["/api/campaigns", campaignId, "next-pair"],
    enabled: !!campaignId,
  });

  const voteMutation = useMutation({
    mutationFn: async ({ pairId, match }: { pairId: string; match: boolean }) => {
      return apiRequest("POST", `/api/pairs/${pairId}/vote`, {
        scoreBinary: match,
        scoringMode: "binary",
      });
    },
    onSuccess: () => {
      setSessionStats(prev => ({
        reviewCount: prev.reviewCount + 1,
        streak: prev.streak + 1,
      }));
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

  const handleVote = useCallback((match: boolean) => {
    if (pairData?.pair) {
      voteMutation.mutate({ pairId: pairData.pair.id, match });
    }
  }, [pairData?.pair, voteMutation]);

  const handleSkip = useCallback(() => {
    if (pairData?.pair) {
      skipMutation.mutate(pairData.pair.id);
    }
  }, [pairData?.pair, skipMutation]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (voteMutation.isPending || skipMutation.isPending || !pairData?.pair) return;
      
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        handleVote(false);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleVote(true);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        handleSkip();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleVote, handleSkip, voteMutation.isPending, skipMutation.isPending, pairData?.pair]);

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
              <h1 className="text-xl font-semibold text-foreground">
                {campaign?.name || "Review Campaign"}
              </h1>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-sm text-muted-foreground">
                  Progress: {pairData?.progress?.reviewed || 0}/{pairData?.progress?.total || 0} pairs
                </span>
                <span className="text-sm text-muted-foreground">({progress}%)</span>
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

            <Separator />

            {/* Voting buttons */}
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-4">
                <Button
                  size="lg"
                  variant="outline"
                  className="h-14 px-8 gap-3"
                  onClick={() => handleVote(false)}
                  disabled={isSubmitting}
                  data-testid="button-no-match"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <ThumbsDown className="w-5 h-5" />
                  )}
                  No Match
                </Button>
                <Button
                  size="lg"
                  className="h-14 px-8 gap-3"
                  onClick={() => handleVote(true)}
                  disabled={isSubmitting}
                  data-testid="button-yes-match"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <ThumbsUp className="w-5 h-5" />
                  )}
                  Yes Match
                </Button>
              </div>

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
            <KeyboardShortcuts />
          </>
        )}
      </div>
    </div>
  );
}
