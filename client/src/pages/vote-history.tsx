import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient as qc } from "@/lib/queryClient";
import {
  ArrowLeft,
  ThumbsUp,
  ThumbsDown,
  HelpCircle,
  Edit,
  ExternalLink,
  AlertCircle,
} from "lucide-react";
import type { Vote, Pair } from "@shared/schema";

type VoteWithPair = Vote & { pair: Pair };

function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function VoteCard({
  vote,
  onEdit,
}: {
  vote: VoteWithPair;
  onEdit: (vote: VoteWithPair) => void;
}) {
  const isLoinc = vote.pair.targetDataset?.toUpperCase() === "LOINC";

  return (
    <Card className="border-card-border" data-testid={`card-vote-${vote.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              {vote.scoringMode === "binary" ? (
                vote.scoreBinary === "match" ? (
                  <Badge className="bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20">
                    <ThumbsUp className="w-3 h-3 mr-1" />
                    Confirmed
                  </Badge>
                ) : vote.scoreBinary === "unsure" ? (
                  <Badge className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20">
                    <HelpCircle className="w-3 h-3 mr-1" />
                    Unsure
                  </Badge>
                ) : (
                  <Badge className="bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20">
                    <ThumbsDown className="w-3 h-3 mr-1" />
                    Rejected
                  </Badge>
                )
              ) : (
                <Badge variant="secondary">
                  Score: {vote.scoreNumeric}/5
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">
                {formatDate(vote.createdAt)}
              </span>
              {vote.updatedAt && new Date(vote.updatedAt).getTime() > new Date(vote.createdAt).getTime() + 1000 && (
                <span className="text-xs text-muted-foreground italic">
                  (edited)
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Source</p>
                <p className="text-sm line-clamp-2">{vote.pair.sourceText}</p>
                <p className="text-xs font-mono text-muted-foreground mt-1">
                  {vote.pair.sourceId}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Target</p>
                <p className="text-sm line-clamp-2">{vote.pair.targetText || "(No match)"}</p>
                <p className="text-xs font-mono text-muted-foreground mt-1">
                  {isLoinc ? (
                    <a
                      href={`https://loinc.org/${vote.pair.targetId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      {vote.pair.targetId}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    vote.pair.targetId
                  )}
                </p>
              </div>
            </div>
            {vote.expertSelectedCode && (
              <div className="mt-2">
                <Badge variant="outline" className="text-xs">
                  Expert suggestion: {vote.expertSelectedCode}
                </Badge>
              </div>
            )}
            {vote.reviewerNotes && (
              <p className="text-xs text-muted-foreground mt-2 italic">
                Note: {vote.reviewerNotes}
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onEdit(vote)}
            data-testid={`button-edit-vote-${vote.id}`}
          >
            <Edit className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function EditVoteDialog({
  vote,
  open,
  onClose,
}: {
  vote: VoteWithPair | null;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [scoringMode, setScoringMode] = useState<"binary" | "numeric">(
    vote?.scoringMode || "binary"
  );
  const [scoreBinary, setScoreBinary] = useState<"match" | "no_match" | "unsure" | null>(
    vote?.scoreBinary ?? null
  );
  const [scoreNumeric, setScoreNumeric] = useState<number | null>(
    vote?.scoreNumeric ?? null
  );
  const [reviewerNotes, setReviewerNotes] = useState(vote?.reviewerNotes || "");

  // Sync state when the vote prop changes (e.g. user opens a different vote for editing)
  useEffect(() => {
    if (vote) {
      setScoringMode(vote.scoringMode || "binary");
      setScoreBinary(vote.scoreBinary ?? null);
      setScoreNumeric(vote.scoreNumeric ?? null);
      setReviewerNotes(vote.reviewerNotes || "");
    }
  }, [vote?.id]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!vote) return;
      return apiRequest("PATCH", `/api/pairs/${vote.pairId}/vote`, {
        scoringMode,
        scoreBinary: scoringMode === "binary" ? scoreBinary : null,
        scoreNumeric: scoringMode === "numeric" ? scoreNumeric : null,
        reviewerNotes: reviewerNotes || null,
      });
    },
    onSuccess: () => {
      toast({
        title: "Vote updated",
        description: "Your vote has been successfully updated.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/users/me/votes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users/me/stats"] });
      onClose();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update vote. Please try again.",
        variant: "destructive",
      });
    },
  });

  if (!vote) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Vote</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="p-3 rounded-md bg-muted/50">
            <p className="text-sm font-medium mb-1">Source</p>
            <p className="text-sm text-muted-foreground line-clamp-2">
              {vote.pair.sourceText}
            </p>
          </div>
          <div className="p-3 rounded-md bg-muted/50">
            <p className="text-sm font-medium mb-1">Target</p>
            <p className="text-sm text-muted-foreground line-clamp-2">
              {vote.pair.targetText || "(No match)"}
            </p>
          </div>

          <div className="space-y-2">
            <Label>Scoring Mode</Label>
            <Select
              value={scoringMode}
              onValueChange={(v) => setScoringMode(v as "binary" | "numeric")}
            >
              <SelectTrigger data-testid="select-scoring-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="binary">Binary (Yes/No)</SelectItem>
                <SelectItem value="numeric">Numeric (1-5)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {scoringMode === "binary" ? (
            <div className="space-y-2">
              <Label>Your Vote</Label>
              <div className="flex gap-2">
                <Button
                  variant={scoreBinary === "no_match" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setScoreBinary("no_match")}
                  data-testid="button-edit-no-match"
                >
                  <ThumbsDown className="w-4 h-4 mr-2" />
                  Reject
                </Button>
                <Button
                  variant={scoreBinary === "unsure" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setScoreBinary("unsure")}
                  data-testid="button-edit-unsure"
                >
                  <HelpCircle className="w-4 h-4 mr-2" />
                  Unsure
                </Button>
                <Button
                  variant={scoreBinary === "match" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setScoreBinary("match")}
                  data-testid="button-edit-yes-match"
                >
                  <ThumbsUp className="w-4 h-4 mr-2" />
                  Confirm
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Your Score</Label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Button
                    key={n}
                    variant={scoreNumeric === n ? "default" : "outline"}
                    className="flex-1"
                    onClick={() => setScoreNumeric(n)}
                    data-testid={`button-edit-score-${n}`}
                  >
                    {n}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                1 = Unrelated, 5 = Exact match
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Textarea
              value={reviewerNotes}
              onChange={(e) => setReviewerNotes(e.target.value)}
              placeholder="Add any notes about your decision..."
              maxLength={500}
              data-testid="input-edit-notes"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => updateMutation.mutate()}
            disabled={updateMutation.isPending}
            data-testid="button-save-vote"
          >
            {updateMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function VoteHistoryPage() {
  const [, setLocation] = useLocation();
  const [editingVote, setEditingVote] = useState<VoteWithPair | null>(null);

  const { data: votes, isLoading, isError } = useQuery<VoteWithPair[]>({
    queryKey: ["/api/users/me/votes"],
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-4xl mx-auto p-6 space-y-6">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10" />
            <Skeleton className="h-8 w-48" />
          </div>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-md w-full border-card-border">
          <CardContent className="flex flex-col items-center py-12">
            <AlertCircle className="w-12 h-12 text-destructive mb-4" />
            <h2 className="text-lg font-medium text-foreground mb-2">
              Unable to Load Vote History
            </h2>
            <p className="text-sm text-muted-foreground text-center mb-4">
              There was an error loading your vote history. Please try again.
            </p>
            <Button onClick={() => setLocation("/")} data-testid="button-back">
              Back to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
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
              Vote History
            </h1>
            <p className="text-sm text-muted-foreground">
              {votes?.length || 0} votes total
            </p>
          </div>
        </div>

        {votes && votes.length === 0 ? (
          <Card className="border-card-border">
            <CardContent className="flex flex-col items-center py-12">
              <p className="text-muted-foreground mb-4">
                You haven't voted on any pairs yet.
              </p>
              <Button onClick={() => setLocation("/")} data-testid="button-start-reviewing">
                Start Reviewing
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {votes?.map((vote) => (
              <VoteCard
                key={vote.id}
                vote={vote}
                onEdit={setEditingVote}
              />
            ))}
          </div>
        )}
      </div>

      <EditVoteDialog
        vote={editingVote}
        open={!!editingVote}
        onClose={() => setEditingVote(null)}
      />
    </div>
  );
}
