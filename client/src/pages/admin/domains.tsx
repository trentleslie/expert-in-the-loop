import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { Plus, Trash2, Globe, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import type { AllowedDomain } from "@shared/schema";

export default function DomainsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newDomain, setNewDomain] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const { data: domains, isLoading } = useQuery<AllowedDomain[]>({
    queryKey: ["/api/admin/domains"],
  });

  const addMutation = useMutation({
    mutationFn: async (domain: string) => {
      return apiRequest("POST", "/api/admin/domains", { domain });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/domains"] });
      setNewDomain("");
      toast({ title: "Domain added successfully" });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to add domain",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (domain: string) => {
      return apiRequest("DELETE", `/api/admin/domains/${encodeURIComponent(domain)}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/domains"] });
      setDeleteTarget(null);
      toast({ title: "Domain removed successfully" });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to remove domain",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleAdd = () => {
    const trimmed = newDomain.trim().toLowerCase();
    if (!trimmed) return;
    
    const domainRegex = /^[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,}$/;
    if (!domainRegex.test(trimmed)) {
      toast({
        title: "Invalid domain format",
        description: "Please enter a valid domain (e.g., example.com)",
        variant: "destructive",
      });
      return;
    }
    
    addMutation.mutate(trimmed);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Domain Management</h1>
          <p className="text-sm text-muted-foreground">
            Manage allowed email domains for Google OAuth authentication
          </p>
        </div>

        <Card className="border-card-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Add New Domain
            </CardTitle>
            <CardDescription>
              Users with email addresses from allowed domains can sign in with Google
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                placeholder="example.com"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                className="max-w-sm"
                data-testid="input-new-domain"
              />
              <Button
                onClick={handleAdd}
                disabled={!newDomain.trim() || addMutation.isPending}
                data-testid="button-add-domain"
              >
                Add Domain
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-card-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Globe className="w-4 h-4" />
              Allowed Domains
            </CardTitle>
            <CardDescription>
              {domains?.length || 0} domain{(domains?.length || 0) !== 1 ? "s" : ""} configured
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4 space-y-2">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
              </div>
            ) : domains && domains.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Domain</TableHead>
                    <TableHead>Added</TableHead>
                    <TableHead className="w-16"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {domains.map((domain) => (
                    <TableRow key={domain.domain}>
                      <TableCell className="font-mono">{domain.domain}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {domain.addedAt ? format(new Date(domain.addedAt), "MMM d, yyyy") : "-"}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteTarget(domain.domain)}
                          data-testid={`button-delete-${domain.domain}`}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="p-6 text-center text-muted-foreground flex flex-col items-center gap-2">
                <AlertCircle className="w-6 h-6" />
                <p>No domains configured. Add a domain to enable sign-in.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Domain</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <strong>{deleteTarget}</strong>? 
              Users with this email domain will no longer be able to sign in.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
