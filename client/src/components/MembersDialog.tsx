import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Link2, MoreVertical, Crown, UserMinus } from "lucide-react";
import type { MembershipRole } from "@shared/schema";

// A membership/roster row. Blinding (R10): identity + role + join facts only —
// no machine pick, candidate, or provenance fields (see campaignFocus
// MEMBERSHIP_ROW_KEYS + hasOnlyMembershipKeys).
type RosterMember = {
  userId: string;
  email: string;
  displayName: string | null;
  role: MembershipRole;
  joinedAt: string;
};

/**
 * Members dialog shared by the admin campaigns page and the reviewer-home owned
 * card. Lists who has access, badges their role, and — for owners/admins —
 * exposes copy-share-link, remove-participant, and add-co-owner (promote).
 *
 * `canManage` gates the mutating affordances; it's true for a campaign owner or
 * an admin (the roster route is itself owner-or-admin gated). The last-owner
 * remove guard is mirrored here (disabled) but authoritatively enforced server
 * side (R7) — the mutation still surfaces the server's 409 if it races.
 */
export function MembersDialog({
  campaign,
  open,
  onOpenChange,
  canManage = true,
}: {
  campaign: { id: string; name: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canManage?: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [pendingRemove, setPendingRemove] = useState<RosterMember | null>(null);

  const rosterKey = [`/api/campaigns/${campaign.id}/roster`];
  const { data: roster, isLoading, isError, refetch } = useQuery<RosterMember[]>({
    queryKey: rosterKey,
    enabled: open,
  });

  const ownerCount = roster?.filter((m) => m.role === "owner").length ?? 0;

  // Membership mutations invalidate the roster plus the reviewer-facing lists
  // (a promotion/removal changes owned-first ordering and access), mirroring the
  // join flow's invalidation set.
  const invalidateMembership = () => {
    queryClient.invalidateQueries({ queryKey: rosterKey });
    queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
    queryClient.invalidateQueries({ queryKey: ["/api/users/me/campaigns"] });
  };

  const removeMutation = useMutation({
    mutationFn: (userId: string) =>
      apiRequest("DELETE", `/api/campaigns/${campaign.id}/participants/${userId}`),
    onSuccess: () => {
      toast({ title: "Member removed" });
      invalidateMembership();
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "";
      const description = msg.startsWith("409")
        ? "You can't remove the last owner of a campaign."
        : "Failed to remove this member.";
      toast({ title: "Couldn't remove member", description, variant: "destructive" });
    },
    onSettled: () => setPendingRemove(null),
  });

  const addOwnerMutation = useMutation({
    mutationFn: (userId: string) =>
      apiRequest("POST", `/api/campaigns/${campaign.id}/owners`, { userId }),
    onSuccess: () => {
      toast({ title: "Co-owner added" });
      invalidateMembership();
    },
    onError: () => {
      toast({ title: "Couldn't add co-owner", description: "Failed to promote this member.", variant: "destructive" });
    },
  });

  const handleCopyLink = async () => {
    const url = `${window.location.origin}/campaigns/${campaign.id}/join`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Share link copied", description: url });
    } catch {
      toast({ title: "Couldn't copy link", description: url, variant: "destructive" });
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Members — {campaign.name}</DialogTitle>
            <DialogDescription>
              Everyone with access to this campaign. Owners can manage members.
            </DialogDescription>
          </DialogHeader>

          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={handleCopyLink}
              data-testid={`button-members-copy-link-${campaign.id}`}
            >
              <Link2 className="w-4 h-4" />
              Copy share link
            </Button>
          </div>

          {isLoading ? (
            <div className="py-4 space-y-2">
              <Skeleton className="h-9" />
              <Skeleton className="h-9" />
            </div>
          ) : isError ? (
            <div className="py-6 flex flex-col items-center gap-3 text-center" data-testid={`members-error-${campaign.id}`}>
              <p className="text-sm text-muted-foreground max-w-xs">
                Couldn't load members — this may be a temporary error or your access may have changed.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                data-testid={`button-members-retry-${campaign.id}`}
              >
                Retry
              </Button>
            </div>
          ) : roster && roster.length > 0 ? (
            <div className="divide-y divide-border max-h-80 overflow-y-auto">
              {roster.map((m) => {
                const isOwner = m.role === "owner";
                const isLastOwner = isOwner && ownerCount <= 1;
                return (
                  <div
                    key={m.userId}
                    className="flex items-center justify-between gap-3 py-2"
                    data-testid={`member-row-${m.userId}`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{m.displayName || m.email}</p>
                      <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge
                        variant={isOwner ? "default" : "secondary"}
                        className="text-xs"
                        data-testid={`member-role-${m.userId}`}
                      >
                        {isOwner ? "Owner" : "Participant"}
                      </Badge>
                      {canManage && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              data-testid={`button-member-menu-${m.userId}`}
                            >
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {!isOwner && (
                              <DropdownMenuItem
                                onClick={() => addOwnerMutation.mutate(m.userId)}
                                disabled={addOwnerMutation.isPending}
                                data-testid={`button-make-owner-${m.userId}`}
                              >
                                <Crown className="w-4 h-4 mr-2" />
                                Make co-owner
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onClick={() => setPendingRemove(m)}
                              disabled={isLastOwner}
                              className={isLastOwner ? undefined : "text-destructive"}
                              data-testid={`button-remove-member-${m.userId}`}
                            >
                              <UserMinus className="w-4 h-4 mr-2" />
                              {isLastOwner ? "Remove (last owner)" : "Remove"}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="py-6 text-sm text-muted-foreground text-center">
              No one has access yet. Share the link above to invite reviewers.
            </p>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={pendingRemove !== null}
        onOpenChange={(o) => {
          if (!o) setPendingRemove(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this member?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRemove
                ? `${pendingRemove.displayName || pendingRemove.email} will lose access to "${campaign.name}". They can rejoin later via the share link.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (pendingRemove) removeMutation.mutate(pendingRemove.userId);
              }}
              disabled={removeMutation.isPending}
              data-testid="button-confirm-remove-member"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
