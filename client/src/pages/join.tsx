import { useEffect, useRef, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, AlertCircle } from "lucide-react";

// Reached via a campaign's shareable link (/campaigns/:id/join). Joins the
// signed-in user to the campaign, then drops them into review. Unauthenticated
// visitors are routed through Clerk sign-in first (ProtectedRoute preserves the
// target), so by the time this renders the user is authenticated.
export default function JoinPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const firedRef = useRef(false);

  const join = useMutation({
    mutationFn: () => apiRequest("POST", `/api/campaigns/${id}/join`),
    onSuccess: () => {
      // Single-string keys are NOT reached by ["/api/campaigns"] list-prefix
      // invalidation — refresh both the browse-all list and the joined set
      // explicitly so the home reflects the new membership.
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users/me/campaigns"] });
      setLocation(`/review/${id}`);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "";
      if (msg.startsWith("403")) setError("This campaign isn't open for joining.");
      else if (msg.startsWith("404")) setError("That campaign couldn't be found.");
      else setError("Something went wrong joining this campaign.");
    },
  });

  // Fire exactly once — React 18 StrictMode double-invokes effects, and the DB
  // write is idempotent but the navigation/invalidation is not.
  useEffect(() => {
    if (firedRef.current || !id) return;
    firedRef.current = true;
    join.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (error) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <Card className="max-w-md w-full border-card-border">
          <CardContent className="flex flex-col items-center text-center py-12">
            <AlertCircle className="w-10 h-10 text-muted-foreground mb-4" />
            <h2 className="text-lg font-medium text-foreground mb-2">Can't open this campaign</h2>
            <p className="text-sm text-muted-foreground mb-6">{error}</p>
            <Button onClick={() => setLocation("/")} data-testid="button-join-back-home">
              Back to home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6" data-testid="join-loading">
      <div className="flex flex-col items-center text-muted-foreground">
        <Loader2 className="w-8 h-8 animate-spin mb-3" />
        <p className="text-sm">Joining campaign…</p>
      </div>
    </div>
  );
}
