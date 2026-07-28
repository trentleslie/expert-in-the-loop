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
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { classifyReviewError } from "@/lib/reviewError";
import { getStoredExpandedPanels, REVIEW_PANELS_STORAGE_KEY } from "@/lib/reviewPanels";
import { getConfirmBeforeSubmit, setConfirmBeforeSubmit } from "@/lib/reviewPreferences";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScoringControls, type BinaryValue } from "@/components/ScoringControls";
import {
  SkipForward,
  ArrowLeft,
  Keyboard,
  Zap,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  ExternalLink as ExternalLinkIcon,
  FileText,
  Bot,
} from "lucide-react";
import type { Campaign, Pair } from "@shared/schema";
import type { CampaignConfig } from "@shared/campaignConfig";
import { DEFAULT_CAMPAIGN_CONFIG } from "@shared/campaignConfig";

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

/**
 * Generic external link for an entity id, driven by the campaign config's
 * `display.linkTemplate`. The template's `{targetId}` placeholder is replaced
 * with the URL-encoded id. Renders plain text (no link) when:
 *  - external links are disabled,
 *  - no usable template is supplied (missing or lacking `{targetId}`),
 *  - the id is a sentinel value such as NO_MATCH.
 * The config schema already constrains the template scheme to https://; we still
 * encodeURIComponent the id defensively.
 */
function ExternalEntityLink({
  id,
  showExternalLinks,
  linkTemplate,
  className,
}: {
  id: string;
  showExternalLinks: boolean;
  linkTemplate?: string;
  className?: string;
}) {
  const isSentinel = !id || id === "NO_MATCH" || id.startsWith("NO_");
  const hasUsableTemplate = !!linkTemplate && linkTemplate.includes("{targetId}");

  if (!showExternalLinks || isSentinel || !hasUsableTemplate) {
    return <span className={`font-mono ${className || ""}`}>{id}</span>;
  }

  const href = linkTemplate!.replace("{targetId}", encodeURIComponent(id));
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1 text-primary hover:underline ${className || ""}`}
      data-testid={`link-external-${id}`}
    >
      {id}
      <ExternalLinkIcon className="w-3 h-3" />
    </a>
  );
}

function EntityCard({
  type,
  text,
  dataset,
  id,
  metadata,
  display,
}: {
  type: "source" | "target";
  text: string;
  dataset: string;
  id: string;
  metadata?: Record<string, unknown> | null;
  display: CampaignConfig["display"];
}) {
  // Suggested alternatives are now just ordinary metadata columns (the admin
  // chooses which to display) — no special parsing. The reviewer types their
  // chosen alternate into the free-text "Suggest alternative match" box below.
  const displayMetadata = display.showMetadataPanel && metadata
    ? Object.entries(metadata).slice(0, 3)
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
        <p className="text-lg text-foreground leading-relaxed flex-1 min-h-0 max-h-[50vh] break-words overflow-y-auto" data-testid={`text-entity-${type}`}>
          {text.split("\u2028").filter(Boolean).map((line, i) => (
            <span key={i} className="block">{line}</span>
          ))}
        </p>
        <div className="mt-4 pt-3 border-t border-border space-y-2">
          <p className="text-sm font-mono text-muted-foreground" data-testid={`text-entity-id-${type}`}>
            ID:{" "}
            <ExternalEntityLink
              id={id}
              // Only the TARGET entity gets the external link — the template is
              // target-namespaced ({targetId}); linking the source id produced a
              // bogus URL (finding #2). Alternatives below are target-side codes.
              showExternalLinks={display.showExternalLinks && type === "target"}
              linkTemplate={display.linkTemplate}
            />
          </p>
          {displayMetadata.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {displayMetadata.map(([key, value]) => (
                <Badge key={key} variant="secondary" className="text-xs max-w-full break-words whitespace-normal">
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

function KeyboardShortcuts({ scoring }: { scoring: CampaignConfig["scoring"] }) {
  if (scoring.mode === "numeric") {
    const { min, max } = scoring.numeric;
    const keys: number[] = [];
    // Only the single-digit 1-9 keys map to scores (see keydown handler).
    for (let i = Math.max(min, 1); i <= Math.min(max, 9); i++) keys.push(i);
    return (
      <div className="flex items-center justify-center gap-6 py-3 text-xs text-muted-foreground flex-wrap">
        <div className="flex items-center gap-1.5">
          <Keyboard className="w-3.5 h-3.5" />
          <span>Keyboard shortcuts:</span>
        </div>
        {keys.map((n) => (
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

  if (scoring.mode === "partition") {
    // Partition grouping is multi-step (no single-key vote); only Skip has a shortcut.
    return (
      <div className="flex items-center justify-center gap-6 py-3 text-xs text-muted-foreground flex-wrap">
        <div className="flex items-center gap-1.5">
          <Keyboard className="w-3.5 h-3.5" />
          <span>Keyboard shortcuts:</span>
        </div>
        <div className="flex items-center gap-1">
          <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">↓</kbd>
          <span>Skip</span>
        </div>
      </div>
    );
  }

  const { labels } = scoring.binary;
  return (
    <div className="flex items-center justify-center gap-6 py-3 text-xs text-muted-foreground flex-wrap">
      <div className="flex items-center gap-1.5">
        <Keyboard className="w-3.5 h-3.5" />
        <span>Keyboard shortcuts:</span>
      </div>
      <div className="flex items-center gap-1">
        <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">←</kbd>
        <span>{labels.negative}</span>
      </div>
      <div className="flex items-center gap-1">
        <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">U</kbd>
        <span>{labels.neutral}</span>
      </div>
      <div className="flex items-center gap-1">
        <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">→</kbd>
        <span>{labels.positive}</span>
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

  // Accordion panel state with localStorage persistence. A fresh reviewer gets
  // the instructions panel open by default (resolveExpandedPanels); a stored
  // preference — including a deliberate collapse — wins.
  const [expandedPanels, setExpandedPanels] = useState<string[]>(() => getStoredExpandedPanels());

  // Persist expanded panels to localStorage (best-effort; ignore storage errors)
  useEffect(() => {
    try {
      localStorage.setItem(REVIEW_PANELS_STORAGE_KEY, JSON.stringify(expandedPanels));
    } catch {
      /* ignore (private mode / quota) */
    }
  }, [expandedPanels]);

  // Per-panel value/onChange helpers: the instructions and LLM-reasoning panels
  // live in separate Accordions (above vs. below the comparison cards) but share
  // one persisted array, so each accordion must preserve the other's open state
  // on change rather than overwrite the whole list.
  const panelProps = (panel: string) => ({
    value: expandedPanels.includes(panel) ? [panel] : [],
    onValueChange: (vals: string[]) =>
      setExpandedPanels((prev) => [...prev.filter((v) => v !== panel), ...vals]),
  });

  // Pending vote state for confirmation dialog
  const [pendingVote, setPendingVote] = useState<{
    type: 'binary';
    value: "match" | "no_match" | "unsure";
  } | {
    type: 'numeric';
    value: number;
  } | {
    type: 'partition';
    value: string[][]; // the reviewer's grouping of member ids
  } | null>(null);

  const [pendingSkip, setPendingSkip] = useState(false);

  const { data: campaign } = useQuery<Campaign>({
    queryKey: [`/api/campaigns/${campaignId}`, "detail", campaignId],
    enabled: !!campaignId,
  });

  // Campaign-level config drives scoring mode, labels, and which review-UI
  // elements show. Fall back to the shared default when unset.
  const config: CampaignConfig = campaign?.config ?? DEFAULT_CAMPAIGN_CONFIG;
  const { scoring, display } = config;

  const { 
    data: pairData, 
    isLoading: pairLoading, 
    refetch: refetchPair,
    isError: pairError,
    error: pairErrorObj,
  } = useQuery<NextPairResponse>({
    queryKey: [`/api/campaigns/${campaignId}/next-pair`, "next-pair", campaignId],
    enabled: !!campaignId,
  });

  // Partition mode: the member variables to group live in the pair's sourceMetadata.members.
  const partitionMembers: { id: string; text: string }[] = Array.isArray(
    (pairData?.pair?.sourceMetadata as { members?: unknown } | null)?.members,
  )
    ? (pairData!.pair!.sourceMetadata as { members: { id: string; text: string }[] }).members
    : [];

  const voteMutation = useMutation({
    mutationFn: async ({ pairId, scoreBinary, scoreNumeric, scorePartition, expertCode, notes, scoringMode }: {
      pairId: string;
      scoreBinary: "match" | "no_match" | "unsure" | null;
      scoreNumeric: number | null;
      scorePartition: { groups: string[][] } | null;
      expertCode: string | null;
      notes: string;
      scoringMode: "binary" | "numeric" | "partition";
    }) => {
      return apiRequest("POST", `/api/pairs/${pairId}/vote`, {
        scoreBinary,
        scoreNumeric,
        scorePartition,
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
      // Casting a vote can re-tier the pair — refresh campaign progress (home)
      // and the results browser, which prefix-match ["/api/campaigns"] (#11).
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
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

  // Per-reviewer toggle: when off, votes/skips submit immediately (no dialog).
  // Default on. Persisted in localStorage.
  const [confirmBeforeSubmit, setConfirmBeforeSubmitState] = useState<boolean>(() => getConfirmBeforeSubmit());
  const handleToggleConfirm = useCallback((checked: boolean) => {
    setConfirmBeforeSubmitState(checked);
    setConfirmBeforeSubmit(checked);
  }, []);

  // Direct-submit functions take the value explicitly so both the dialog path
  // and the no-dialog (toggle-off) path share one code path. Notes/expert-code
  // are read from state at call time.
  const submitBinaryVote = useCallback((value: "match" | "no_match" | "unsure") => {
    if (!pairData?.pair) return;
    voteMutation.mutate({
      pairId: pairData.pair.id,
      scoreBinary: value,
      scoreNumeric: null,
      scorePartition: null,
      scoringMode: scoring.mode,
      expertCode: expertSelectedCode,
      notes: reviewerNotes,
    });
  }, [pairData?.pair, voteMutation, scoring.mode, expertSelectedCode, reviewerNotes]);

  const submitNumericVote = useCallback((value: number) => {
    if (!pairData?.pair) return;
    voteMutation.mutate({
      pairId: pairData.pair.id,
      scoreBinary: null,
      scoreNumeric: value,
      scorePartition: null,
      scoringMode: scoring.mode,
      expertCode: expertSelectedCode,
      notes: reviewerNotes,
    });
  }, [pairData?.pair, voteMutation, scoring.mode, expertSelectedCode, reviewerNotes]);

  const submitPartitionVote = useCallback((groups: string[][]) => {
    if (!pairData?.pair) return;
    voteMutation.mutate({
      pairId: pairData.pair.id,
      scoreBinary: null,
      scoreNumeric: null,
      scorePartition: { groups },
      scoringMode: scoring.mode,
      expertCode: expertSelectedCode,
      notes: reviewerNotes,
    });
  }, [pairData?.pair, voteMutation, scoring.mode, expertSelectedCode, reviewerNotes]);

  const submitSkip = useCallback(() => {
    if (!pairData?.pair) return;
    skipMutation.mutate(pairData.pair.id);
  }, [pairData?.pair, skipMutation]);

  const handleBinaryVote = useCallback((score: "match" | "no_match" | "unsure") => {
    if (!pairData?.pair) return;
    if (confirmBeforeSubmit) setPendingVote({ type: 'binary', value: score });
    else submitBinaryVote(score);
  }, [pairData?.pair, confirmBeforeSubmit, submitBinaryVote]);

  const handleNumericVote = useCallback((score: number) => {
    if (!pairData?.pair) return;
    if (confirmBeforeSubmit) setPendingVote({ type: 'numeric', value: score });
    else submitNumericVote(score);
  }, [pairData?.pair, confirmBeforeSubmit, submitNumericVote]);

  const handlePartitionVote = useCallback((groups: string[][]) => {
    if (!pairData?.pair) return;
    if (confirmBeforeSubmit) setPendingVote({ type: 'partition', value: groups });
    else submitPartitionVote(groups);
  }, [pairData?.pair, confirmBeforeSubmit, submitPartitionVote]);

  const handleSkip = useCallback(() => {
    if (!pairData?.pair) return;
    if (confirmBeforeSubmit) setPendingSkip(true);
    else submitSkip();
  }, [pairData?.pair, confirmBeforeSubmit, submitSkip]);

  // Dialog confirm handlers delegate to the shared submit functions. Guard on
  // pairData?.pair BEFORE closing the dialog: the submit functions no-op without
  // a pair, so closing unconditionally would silently drop the action (dialog
  // shuts, no vote recorded, no feedback). Keep the dialog open instead.
  const confirmVote = useCallback(() => {
    if (!pendingVote || !pairData?.pair) return;
    if (pendingVote.type === 'binary') submitBinaryVote(pendingVote.value);
    else if (pendingVote.type === 'numeric') submitNumericVote(pendingVote.value);
    else submitPartitionVote(pendingVote.value);
    setPendingVote(null);
  }, [pendingVote, pairData?.pair, submitBinaryVote, submitNumericVote, submitPartitionVote]);

  const confirmSkip = useCallback(() => {
    if (!pairData?.pair) return;
    submitSkip();
    setPendingSkip(false);
  }, [pairData?.pair, submitSkip]);

  const cancelPendingAction = useCallback(() => {
    setPendingVote(null);
    setPendingSkip(false);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore auto-repeat from a held key. Critical in no-confirm mode, where a
      // held vote/skip key would otherwise chain-submit onto the next pair before
      // the reviewer sees it.
      if (e.repeat) return;

      // Handle dialog keyboard shortcuts first
      if (pendingVote || pendingSkip) {
        if (e.key === "Enter") {
          e.preventDefault();
          pendingVote ? confirmVote() : confirmSkip();
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          cancelPendingAction();
          return;
        }
        return; // Block all other shortcuts while dialog is open
      }

      // Guard: don't fire shortcuts when typing in inputs
      const activeTag = (document.activeElement as HTMLElement)?.tagName;
      if (activeTag === "TEXTAREA" || activeTag === "INPUT") {
        return;
      }

      if (voteMutation.isPending || skipMutation.isPending || !pairData?.pair) return;

      if (scoring.mode === "numeric") {
        // Numeric mode: single-digit keys (1-9) within the configured range.
        const numKey = parseInt(e.key);
        if (
          !Number.isNaN(numKey) &&
          numKey >= Math.max(scoring.numeric.min, 1) &&
          numKey <= Math.min(scoring.numeric.max, 9)
        ) {
          e.preventDefault();
          handleNumericVote(numKey);
          return;
        }
      } else if (scoring.mode === "binary") {
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
      // Partition mode: no single-key vote shortcut (grouping is multi-step); only Skip (below).

      // Skip works in both modes
      if (e.key === "ArrowDown") {
        e.preventDefault();
        handleSkip();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleBinaryVote, handleNumericVote, handleSkip, voteMutation.isPending, skipMutation.isPending, pairData?.pair, scoring, pendingVote, pendingSkip, confirmVote, confirmSkip, cancelPendingAction]);

  const progress = pairData?.progress 
    ? Math.round((pairData.progress.reviewed / Math.max(pairData.progress.total, 1)) * 100)
    : 0;

  const isSubmitting = voteMutation.isPending || skipMutation.isPending;

  if (pairError) {
    // A non-member (or a participant who oversteps) gets a clean 403/404 from
    // the API. Present that as "not available to you" with a way out — not a
    // retryable technical error. Genuine failures keep the Try Again path.
    if (classifyReviewError(pairErrorObj) === "access") {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-6">
          <Card className="max-w-md w-full border-card-border">
            <CardContent className="flex flex-col items-center py-12">
              <AlertCircle className="w-12 h-12 text-muted-foreground mb-4" />
              <h2 className="text-lg font-medium text-foreground mb-2">
                Campaign not available
              </h2>
              <p className="text-sm text-muted-foreground text-center mb-4">
                This campaign doesn't exist or hasn't been shared with you. Ask an
                owner for a join link to get access.
              </p>
              <Button onClick={() => setLocation("/")} data-testid="button-go-home">
                Go to Home
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }
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
            {/* Campaign Instructions — surfaced at the top, expanded by default.
                Treat null/empty/whitespace as "no instructions" (the field can be
                cleared from the admin Configure dialog). */}
            {campaign?.instructions && campaign.instructions.trim() !== "" && (
              <Accordion type="multiple" {...panelProps("instructions")} className="space-y-2">
                <AccordionItem value="instructions" className="border rounded-lg px-4">
                  <AccordionTrigger className="hover:no-underline py-3">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                      <span>Campaign Instructions</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-4">
                    <div className="text-sm text-muted-foreground whitespace-pre-wrap bg-muted/50 rounded-md p-3">
                      {campaign.instructions}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}

            {/* Entity comparison */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <EntityCard
                type="source"
                text={pairData.pair.sourceText}
                dataset={pairData.pair.sourceDataset}
                id={pairData.pair.sourceId}
                metadata={pairData.pair.sourceMetadata as Record<string, unknown> | null}
                display={display}
              />
              <EntityCard
                type="target"
                text={pairData.pair.targetText}
                dataset={pairData.pair.targetDataset}
                id={pairData.pair.targetId}
                metadata={pairData.pair.targetMetadata as Record<string, unknown> | null}
                display={display}
              />
            </div>

            {/* Collapsible context panels (LLM reasoning stays below the cards
                so reviewers form their own judgment first). */}
            <Accordion
              type="multiple"
              {...panelProps("llm-reasoning")}
              className="space-y-2"
            >
              {/* LLM Reasoning Panel */}
              {(pairData.pair.llmReasoning || pairData.pair.llmConfidence !== null) && (
                <AccordionItem value="llm-reasoning" className="border rounded-lg px-4">
                  <AccordionTrigger className="hover:no-underline py-3">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Bot className="w-4 h-4 text-muted-foreground" />
                      <span>LLM Reasoning</span>
                      {!expandedPanels.includes("llm-reasoning") && (
                        <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-normal ml-2">
                          <AlertTriangle className="w-3 h-3" />
                          Form your own judgment before expanding
                        </span>
                      )}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-4 space-y-3">
                    <div className="flex items-start gap-2 p-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                      <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                      <p className="text-xs text-amber-700 dark:text-amber-300">
                        <strong>Bias Warning:</strong> LLM reasoning may anchor your judgment.
                        Consider forming your initial opinion before reviewing this section.
                      </p>
                    </div>

                    {pairData.pair.llmConfidence !== null && (
                      <div className="flex items-center gap-3 text-sm">
                        <span className="text-muted-foreground">Confidence:</span>
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full transition-all ${
                                pairData.pair.llmConfidence >= 0.8 ? "bg-green-500" :
                                pairData.pair.llmConfidence >= 0.6 ? "bg-yellow-500" : "bg-red-500"
                              }`}
                              style={{ width: `${pairData.pair.llmConfidence * 100}%` }}
                            />
                          </div>
                          <span className="font-mono text-xs">
                            {(pairData.pair.llmConfidence * 100).toFixed(0)}%
                          </span>
                        </div>
                        {pairData.pair.llmModel && (
                          <span className="text-xs text-muted-foreground">
                            ({pairData.pair.llmModel})
                          </span>
                        )}
                      </div>
                    )}

                    {pairData.pair.llmReasoning && (
                      <div className="text-sm text-muted-foreground whitespace-pre-wrap bg-muted/50 rounded-md p-3">
                        {pairData.pair.llmReasoning}
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>
              )}
            </Accordion>

            {/* Expert selection and notes */}
            <Card className="border-card-border">
              <CardContent className="p-4 space-y-4">
                {/* Expert alternative entry (gated on config.display.showAlternatives).
                    Free-text: the reviewer types the correct identifier directly.
                    Any suggested alternatives are shown as ordinary metadata on the
                    entity cards above. */}
                {display.showAlternatives && (
                  <div className="space-y-2">
                    <label htmlFor="input-expert-code" className="text-sm font-medium text-foreground">
                      Suggest alternative match (optional)
                    </label>
                    <Input
                      id="input-expert-code"
                      value={expertSelectedCode ?? ""}
                      onChange={(e) => setExpertSelectedCode(e.target.value.trim() === "" ? null : e.target.value)}
                      placeholder="Type the correct identifier…"
                      maxLength={128}
                      data-testid="input-expert-code"
                    />
                    <p className="text-xs text-muted-foreground">
                      If the AI's suggestion isn't correct, enter the identifier of a better match.
                    </p>
                  </div>
                )}

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

            {/* Voting controls (config-driven: binary or numeric) */}
            <div className="space-y-4">
              <ScoringControls
                scoring={scoring}
                isSubmitting={isSubmitting}
                binaryValue={pendingVote?.type === "binary" ? pendingVote.value : null}
                onBinarySelect={handleBinaryVote}
                numericValue={pendingVote?.type === "numeric" ? pendingVote.value : null}
                onNumericSelect={handleNumericVote}
                members={partitionMembers}
                onPartitionSelect={handlePartitionVote}
              />

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

              <div className="flex items-center justify-center gap-2 pt-1">
                <Switch
                  id="confirm-before-submit"
                  checked={confirmBeforeSubmit}
                  onCheckedChange={handleToggleConfirm}
                  data-testid="switch-confirm-before-submit"
                />
                <Label htmlFor="confirm-before-submit" className="text-xs text-muted-foreground font-normal cursor-pointer">
                  Confirm before submitting
                </Label>
              </div>
            </div>

            {/* Keyboard shortcuts */}
            <KeyboardShortcuts scoring={scoring} />
          </>
        )}
      </div>

      {/* Vote Confirmation Dialog */}
      <AlertDialog open={!!pendingVote} onOpenChange={() => setPendingVote(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Vote</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>You are about to submit:</p>
                <p className="text-2xl font-semibold text-center py-2">
                  {pendingVote?.type === 'binary'
                    ? (scoring.mode === 'binary'
                        ? (pendingVote.value === 'match'
                            ? scoring.binary.labels.positive
                            : pendingVote.value === 'no_match'
                              ? scoring.binary.labels.negative
                              : scoring.binary.labels.neutral)
                        : pendingVote.value)
                    : pendingVote?.type === 'numeric'
                      ? `${pendingVote.value}${
                          scoring.mode === 'numeric' && scoring.numeric.labels?.[String(pendingVote.value)]
                            ? ` - ${scoring.numeric.labels[String(pendingVote.value)]}`
                            : ''
                        }`
                      : pendingVote?.type === 'partition'
                        ? (pendingVote.value.length === 1
                            ? 'One concept'
                            : `Over-merge — ${pendingVote.value.length} concepts`)
                        : ''}
                </p>
                <p className="text-sm text-muted-foreground">
                  <strong>Notes:</strong> {reviewerNotes.trim() || 'No notes'}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmVote} disabled={voteMutation.isPending}>
              {voteMutation.isPending ? 'Submitting...' : 'Submit Vote'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Skip Confirmation Dialog */}
      <AlertDialog open={pendingSkip} onOpenChange={() => setPendingSkip(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Skip This Pair?</AlertDialogTitle>
            <AlertDialogDescription>
              This pair will be removed from your queue. You can find it later in your skipped pairs if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSkip} disabled={skipMutation.isPending}>
              {skipMutation.isPending ? 'Skipping...' : 'Skip Pair'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
