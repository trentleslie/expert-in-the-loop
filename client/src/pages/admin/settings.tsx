import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  Plus, 
  Trash2, 
  Globe,
  Shield,
  Loader2
} from "lucide-react";
import type { AllowedDomain } from "@shared/schema";
import { format } from "date-fns";

function AddDomainDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [domain, setDomain] = useState("");
  const { toast } = useToast();

  const addMutation = useMutation({
    mutationFn: (domain: string) => 
      apiRequest("POST", "/api/admin/domains", { domain }),
    onSuccess: () => {
      toast({ title: "Domain added", description: `${domain} is now allowed.` });
      setOpen(false);
      setDomain("");
      onSuccess();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add domain.", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (domain.trim()) {
      addMutation.mutate(domain.trim().toLowerCase());
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2" data-testid="button-add-domain">
          <Plus className="w-4 h-4" />
          Add Domain
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Allowed Domain</DialogTitle>
          <DialogDescription>
            Users with email addresses from this domain will be able to sign in.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Input
              placeholder="e.g., expertintheloop.io"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              data-testid="input-domain"
            />
            <p className="text-xs text-muted-foreground">
              Enter the domain without @ symbol
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!domain.trim() || addMutation.isPending}>
              {addMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Add Domain
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DomainRow({ domain, onDelete }: { domain: AllowedDomain; onDelete: () => void }) {
  const { toast } = useToast();

  const deleteMutation = useMutation({
    mutationFn: () => 
      apiRequest("DELETE", `/api/admin/domains/${domain.domain}`, undefined),
    onSuccess: () => {
      toast({ title: "Domain removed" });
      onDelete();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to remove domain.", variant: "destructive" });
    },
  });

  return (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-md bg-primary/10">
          <Globe className="w-4 h-4 text-primary" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">{domain.domain}</p>
          <p className="text-xs text-muted-foreground">
            Added {domain.addedAt ? format(new Date(domain.addedAt), "MMM d, yyyy") : "-"}
          </p>
        </div>
      </div>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button 
            variant="ghost" 
            size="icon" 
            className="text-destructive"
            data-testid={`button-delete-domain-${domain.domain}`}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Domain?</AlertDialogTitle>
            <AlertDialogDescription>
              Users with @{domain.domain} email addresses will no longer be able to sign in. 
              Existing users from this domain will lose access on their next login.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => deleteMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Remove Domain"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function AdminSettings() {
  const queryClient = useQueryClient();

  const { data: domains, isLoading } = useQuery<AllowedDomain[]>({
    queryKey: ["/api/admin/domains"],
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/domains"] });
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto p-6 space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
          <p className="text-muted-foreground">
            Manage application settings and access controls
          </p>
        </div>

        {/* Domain Allowlist */}
        <Card className="border-card-border">
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <Shield className="w-4 h-4" />
                Domain Allowlist
              </CardTitle>
              <CardDescription>
                Only users with email addresses from these domains can sign in
              </CardDescription>
            </div>
            <AddDomainDialog onSuccess={handleRefresh} />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
              </div>
            ) : domains && domains.length > 0 ? (
              <div>
                {domains.map((domain) => (
                  <DomainRow key={domain.domain} domain={domain} onDelete={handleRefresh} />
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Globe className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
                <p className="text-sm text-muted-foreground mb-4">
                  No domains configured. Add a domain to enable user sign-in.
                </p>
                <AddDomainDialog onSuccess={handleRefresh} />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Info card */}
        <Card className="border-card-border bg-muted/30">
          <CardContent className="p-6">
            <h3 className="text-sm font-medium text-foreground mb-2">About Domain Restrictions</h3>
            <ul className="text-sm text-muted-foreground space-y-2">
              <li className="flex items-start gap-2">
                <span className="text-primary">•</span>
                Users must sign in with Google using an email from an allowed domain
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary">•</span>
                New users are automatically assigned the "reviewer" role
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary">•</span>
                Admins can promote reviewers to admin status from the Users page
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary">•</span>
                Removing a domain will prevent new sign-ins but won't delete existing users
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
