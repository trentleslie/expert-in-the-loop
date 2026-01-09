import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  Plus, 
  MoreVertical, 
  Upload, 
  Download, 
  Play, 
  Pause, 
  Archive,
  FileUp,
  Loader2
} from "lucide-react";
import type { CampaignWithStats } from "@shared/schema";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const createCampaignSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().max(500).optional(),
  campaignType: z.enum(["questionnaire_match", "loinc_mapping", "custom"]),
});

type CreateCampaignForm = z.infer<typeof createCampaignSchema>;

function CreateCampaignDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const form = useForm<CreateCampaignForm>({
    resolver: zodResolver(createCampaignSchema),
    defaultValues: {
      name: "",
      description: "",
      campaignType: "questionnaire_match",
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateCampaignForm) => 
      apiRequest("POST", "/api/campaigns", data),
    onSuccess: () => {
      toast({ title: "Campaign created", description: "Your new campaign is ready for pairs." });
      setOpen(false);
      form.reset();
      onSuccess();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create campaign.", variant: "destructive" });
    },
  });

  const onSubmit = (data: CreateCampaignForm) => {
    createMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2" data-testid="button-create-campaign">
          <Plus className="w-4 h-4" />
          Create Campaign
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Campaign</DialogTitle>
          <DialogDescription>
            Set up a new validation campaign for entity mapping review.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Campaign Name</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="e.g., Arivale-UKBB Questionnaire Matching" 
                      {...field}
                      data-testid="input-campaign-name"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (Optional)</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Brief description of the campaign goals..."
                      className="resize-none"
                      rows={3}
                      {...field}
                      data-testid="input-campaign-description"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="campaignType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Campaign Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-campaign-type">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="questionnaire_match">Questionnaire Matching</SelectItem>
                      <SelectItem value="loinc_mapping">LOINC Mapping</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={createMutation.isPending}
                data-testid="button-submit-campaign"
              >
                {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Create Campaign
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function UploadPairsDialog({ campaignId, onSuccess }: { campaignId: string; onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const { toast } = useToast();

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`/api/campaigns/${campaignId}/pairs`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!response.ok) throw new Error("Upload failed");
      return response.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: "Pairs uploaded", 
        description: `Successfully imported ${data.count || 0} pairs.` 
      });
      setOpen(false);
      setFile(null);
      onSuccess();
    },
    onError: () => {
      toast({ title: "Upload failed", description: "Please check file format.", variant: "destructive" });
    },
  });

  const handleUpload = () => {
    if (file) {
      uploadMutation.mutate(file);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2" data-testid={`button-upload-pairs-${campaignId}`}>
          <Upload className="w-4 h-4" />
          Upload Pairs
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload Entity Pairs</DialogTitle>
          <DialogDescription>
            Upload a CSV or JSON file containing entity pairs to review.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
            <FileUp className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
            <div className="space-y-2">
              <Label htmlFor="file-upload" className="cursor-pointer">
                <span className="text-primary hover:underline">Click to upload</span>
                <span className="text-muted-foreground"> or drag and drop</span>
              </Label>
              <Input
                id="file-upload"
                type="file"
                accept=".csv,.json"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                data-testid="input-file-upload"
              />
              <p className="text-xs text-muted-foreground">CSV or JSON files</p>
            </div>
          </div>
          {file && (
            <div className="flex items-center gap-2 p-3 bg-muted rounded-md">
              <FileUp className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-foreground flex-1 truncate">{file.name}</span>
              <Button variant="ghost" size="sm" onClick={() => setFile(null)}>
                Remove
              </Button>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button 
            onClick={handleUpload} 
            disabled={!file || uploadMutation.isPending}
            data-testid="button-submit-upload"
          >
            {uploadMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Upload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CampaignCard({ campaign, onUpdate }: { campaign: CampaignWithStats; onUpdate: () => void }) {
  const { toast } = useToast();
  const progress = campaign.totalPairs > 0 
    ? Math.round((campaign.reviewedPairs / campaign.totalPairs) * 100) 
    : 0;

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active": return "bg-green-500/10 text-green-700 dark:text-green-400";
      case "draft": return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400";
      case "completed": return "bg-blue-500/10 text-blue-700 dark:text-blue-400";
      case "archived": return "bg-muted text-muted-foreground";
      default: return "";
    }
  };

  const updateStatusMutation = useMutation({
    mutationFn: (status: string) => 
      apiRequest("PATCH", `/api/campaigns/${campaign.id}`, { status }),
    onSuccess: () => {
      toast({ title: "Campaign updated" });
      onUpdate();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update campaign.", variant: "destructive" });
    },
  });

  const handleExport = async () => {
    try {
      const response = await fetch(`/api/campaigns/${campaign.id}/export`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Export failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${campaign.name.replace(/\s+/g, "_")}_export.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    }
  };

  return (
    <Card className="border-card-border">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base font-medium truncate">
              {campaign.name}
            </CardTitle>
            {campaign.description && (
              <CardDescription className="mt-1 line-clamp-2">
                {campaign.description}
              </CardDescription>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={getStatusColor(campaign.status)}>
              {campaign.status}
            </Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" data-testid={`button-campaign-menu-${campaign.id}`}>
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {campaign.status === "draft" && (
                  <DropdownMenuItem onClick={() => updateStatusMutation.mutate("active")}>
                    <Play className="w-4 h-4 mr-2" />
                    Activate
                  </DropdownMenuItem>
                )}
                {campaign.status === "active" && (
                  <DropdownMenuItem onClick={() => updateStatusMutation.mutate("completed")}>
                    <Pause className="w-4 h-4 mr-2" />
                    Mark Complete
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={handleExport}>
                  <Download className="w-4 h-4 mr-2" />
                  Export Results
                </DropdownMenuItem>
                {campaign.status !== "archived" && (
                  <DropdownMenuItem 
                    onClick={() => updateStatusMutation.mutate("archived")}
                    className="text-destructive"
                  >
                    <Archive className="w-4 h-4 mr-2" />
                    Archive
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-mono text-xs">
              {campaign.reviewedPairs} / {campaign.totalPairs} pairs
            </span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        <div className="flex items-center gap-2 pt-2">
          <UploadPairsDialog campaignId={campaign.id} onSuccess={onUpdate} />
          {campaign.totalPairs > 0 && (
            <Button 
              variant="outline" 
              size="sm" 
              className="gap-2" 
              onClick={handleExport}
              data-testid={`button-export-${campaign.id}`}
            >
              <Download className="w-4 h-4" />
              Export
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminCampaigns() {
  const queryClient = useQueryClient();
  const { data: campaigns, isLoading } = useQuery<CampaignWithStats[]>({
    queryKey: ["/api/campaigns"],
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
  };

  const groupedCampaigns = {
    active: campaigns?.filter(c => c.status === "active") || [],
    draft: campaigns?.filter(c => c.status === "draft") || [],
    completed: campaigns?.filter(c => c.status === "completed") || [],
    archived: campaigns?.filter(c => c.status === "archived") || [],
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto p-6 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Campaign Management</h1>
            <p className="text-muted-foreground">
              Create, manage, and monitor validation campaigns
            </p>
          </div>
          <CreateCampaignDialog onSuccess={handleRefresh} />
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
        ) : (
          <div className="space-y-8">
            {/* Active Campaigns */}
            {groupedCampaigns.active.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-lg font-medium text-foreground flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  Active Campaigns
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {groupedCampaigns.active.map((campaign) => (
                    <CampaignCard key={campaign.id} campaign={campaign} onUpdate={handleRefresh} />
                  ))}
                </div>
              </div>
            )}

            {/* Draft Campaigns */}
            {groupedCampaigns.draft.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-lg font-medium text-foreground flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-yellow-500" />
                  Draft Campaigns
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {groupedCampaigns.draft.map((campaign) => (
                    <CampaignCard key={campaign.id} campaign={campaign} onUpdate={handleRefresh} />
                  ))}
                </div>
              </div>
            )}

            {/* Completed Campaigns */}
            {groupedCampaigns.completed.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-lg font-medium text-foreground flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  Completed Campaigns
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {groupedCampaigns.completed.map((campaign) => (
                    <CampaignCard key={campaign.id} campaign={campaign} onUpdate={handleRefresh} />
                  ))}
                </div>
              </div>
            )}

            {/* Archived Campaigns */}
            {groupedCampaigns.archived.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-lg font-medium text-muted-foreground">Archived Campaigns</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {groupedCampaigns.archived.map((campaign) => (
                    <CampaignCard key={campaign.id} campaign={campaign} onUpdate={handleRefresh} />
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {!campaigns || campaigns.length === 0 ? (
              <Card className="border-card-border">
                <CardContent className="flex flex-col items-center py-12">
                  <div className="p-4 rounded-full bg-muted mb-4">
                    <Plus className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-medium text-foreground mb-2">No Campaigns Yet</h3>
                  <p className="text-sm text-muted-foreground text-center max-w-sm mb-4">
                    Create your first campaign to start collecting human feedback on entity mappings.
                  </p>
                  <CreateCampaignDialog onSuccess={handleRefresh} />
                </CardContent>
              </Card>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
