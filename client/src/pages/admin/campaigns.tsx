import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
  Loader2,
  Search,
  Settings,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle2,
  Link2,
  Users,
} from "lucide-react";
import type { Campaign, CampaignWithStats } from "@shared/schema";
import { CampaignConfigEditor } from "@/components/CampaignConfigEditor";
import { DEFAULT_CAMPAIGN_CONFIG, campaignConfigSchema, type CampaignConfig } from "@shared/campaignConfig";
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
  campaignType: z.string().min(1, "Campaign type is required").max(50, "Campaign type must be 50 characters or less"),
  instructions: z.string().max(2000).optional(),
});

type CreateCampaignForm = z.infer<typeof createCampaignSchema>;

function CampaignTypeCombobox({ value, onChange }: { value: string; onChange: (val: string) => void }) {
  const [inputValue, setInputValue] = useState(value);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const { data: existingTypes = [] } = useQuery<string[]>({
    queryKey: ["/api/campaign-types"],
  });

  const defaultSuggestions = ["match_validation", "classification_review", "recommendation_quality", "loinc_mapping", "custom"];
  const allTypes = Array.from(new Set([...existingTypes, ...defaultSuggestions])).sort();

  const filtered = allTypes.filter(t =>
    t.toLowerCase().includes(inputValue.toLowerCase())
  );

  const handleSelect = (type: string) => {
    setInputValue(type);
    onChange(type);
    setShowSuggestions(false);
  };

  const handleInputChange = (val: string) => {
    setInputValue(val);
    onChange(val);
    setShowSuggestions(true);
  };

  const formatLabel = (type: string) =>
    type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

  return (
    <div className="relative">
      <Input
        value={inputValue}
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={() => setShowSuggestions(true)}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
        placeholder="e.g., match_validation, contract_review"
        data-testid="input-campaign-type"
      />
      {showSuggestions && filtered.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-md max-h-48 overflow-y-auto">
          {filtered.map((type) => (
            <button
              key={type}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover-elevate cursor-pointer"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(type)}
              data-testid={`option-type-${type}`}
            >
              <span className="font-medium">{formatLabel(type)}</span>
              <span className="text-xs text-muted-foreground ml-2 font-mono">{type}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateCampaignDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<CampaignConfig>(DEFAULT_CAMPAIGN_CONFIG);
  // Open by default on create so the (now self-describing) config sections are
  // visible without a click — admins configure infrequently (finding #5 follow-up).
  const [configOpen, setConfigOpen] = useState(true);
  const { toast } = useToast();

  const form = useForm<CreateCampaignForm>({
    resolver: zodResolver(createCampaignSchema),
    defaultValues: {
      name: "",
      description: "",
      campaignType: "",
      instructions: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateCampaignForm & { config: CampaignConfig }) =>
      apiRequest("POST", "/api/campaigns", data),
    onSuccess: () => {
      toast({ title: "Campaign created", description: "Your new campaign is ready for pairs." });
      setOpen(false);
      form.reset();
      setConfig(DEFAULT_CAMPAIGN_CONFIG);
      setConfigOpen(true);
      onSuccess();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create campaign.", variant: "destructive" });
    },
  });

  const configValid = campaignConfigSchema.safeParse(config).success;

  const onSubmit = (data: CreateCampaignForm) => {
    if (!configValid) {
      toast({ title: "Invalid configuration", description: "Fix the scoring/display settings before creating.", variant: "destructive" });
      return;
    }
    createMutation.mutate({ ...data, config });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2" data-testid="button-create-campaign">
          <Plus className="w-4 h-4" />
          Create Campaign
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Campaign</DialogTitle>
          <DialogDescription>
            Set up a new validation campaign for expert review.
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
                      placeholder="e.g., Q4 Product Recommendations Review" 
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
                  <FormControl>
                    <CampaignTypeCombobox
                      value={field.value}
                      onChange={field.onChange}
                    />
                  </FormControl>
                  <FormMessage />
                  <p className="text-xs text-muted-foreground">
                    Choose carefully — the campaign type can't be changed after the campaign is created.
                  </p>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="instructions"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reviewer Instructions (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Provide guidance for reviewers on how to evaluate pairs in this campaign..."
                      className="resize-none"
                      rows={4}
                      {...field}
                      data-testid="input-campaign-instructions"
                    />
                  </FormControl>
                  <FormMessage />
                  <p className="text-xs text-muted-foreground">
                    These instructions will be shown to reviewers in a collapsible panel on the review page.
                  </p>
                </FormItem>
              )}
            />
            <Collapsible open={configOpen} onOpenChange={setConfigOpen} className="border border-border rounded-md">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center justify-between p-3 text-left"
                  data-testid="button-toggle-config"
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <Settings className="w-4 h-4" />
                    Configure scoring &amp; display
                  </span>
                  {configOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="p-3 pt-0">
                <CampaignConfigEditor value={config} onChange={setConfig} />
              </CollapsibleContent>
            </Collapsible>
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

type ConfigSaveResult = { recomputed: number; recomputeStatus: string };

function EditConfigDialog({
  campaign,
  open,
  onOpenChange,
  onUpdate,
}: {
  campaign: CampaignWithStats;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: () => void;
}) {
  const { toast } = useToast();
  const [config, setConfig] = useState<CampaignConfig>(DEFAULT_CAMPAIGN_CONFIG);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Editable campaign details (name/description/instructions). Saved via their
  // own PATCH, decoupled from the config save + recompute flow below.
  // Initialized from the list-row prop (available at mount) so the dialog never
  // flashes a "name required" error before the detail fetch seeds it.
  const [name, setName] = useState(campaign.name ?? "");
  const [description, setDescription] = useState(campaign.description ?? "");
  const [instructions, setInstructions] = useState(campaign.instructions ?? "");

  // Load the campaign's stored config (or the default) when the dialog opens.
  // GET /api/campaigns/:id returns a base Campaign (which already carries
  // config + recomputeStatus) — no need to widen to CampaignWithStats.
  // Single-string key so the default getQueryFn fetches the DETAIL endpoint
  // (`/api/campaigns/:id`). A ["/api/campaigns", id] key would fetch the LIST
  // endpoint and drop the id, making the editor load defaults and clobber the
  // saved config on save (the #5 bug).
  // staleTime:0 so each open refetches the saved config. The global default is
  // staleTime:Infinity, and saving only invalidates the LIST prefix
  // (["/api/campaigns"] in handleRefresh), which — because this is a
  // single-string detail key — does NOT prefix-match. Without this, reopening
  // the editor after a save shows the pre-save cache (the change looks reverted
  // even though it persisted). See docs/solutions/.../getqueryfn-querykey-footgun.
  const { data: fullCampaign } = useQuery<Campaign>({
    queryKey: [`/api/campaigns/${campaign.id}`],
    enabled: open,
    staleTime: 0,
  });

  // Seed config + editable details from the freshly-fetched campaign exactly
  // ONCE per open. Re-seeding on every fullCampaign change would clobber the
  // admin's in-flight edits when the post-save detail refetch lands (the
  // details save invalidates this very query key).
  const seededRef = useRef(false);
  useEffect(() => {
    if (!open) {
      seededRef.current = false; // reset so the next open re-seeds
      return;
    }
    if (seededRef.current || fullCampaign === undefined) return;
    const parsed = campaignConfigSchema.safeParse(fullCampaign.config);
    setConfig(parsed.success ? parsed.data : DEFAULT_CAMPAIGN_CONFIG);
    setName(fullCampaign.name ?? "");
    setDescription(fullCampaign.description ?? "");
    setInstructions(fullCampaign.instructions ?? "");
    seededRef.current = true;
  }, [open, fullCampaign]);

  // A stale 'running' loaded from the server means a prior recompute was
  // interrupted (crash) — surface a retry affordance.
  const staleRunning = campaign.recomputeStatus === "running" || fullCampaign?.recomputeStatus === "running";
  const lastFailed = campaign.recomputeStatus === "failed" || fullCampaign?.recomputeStatus === "failed";

  const hasVotes = campaign.reviewedPairs > 0;
  const configValid = campaignConfigSchema.safeParse(config).success;

  const saveMutation = useMutation({
    mutationFn: (cfg: CampaignConfig) =>
      apiRequest("PUT", `/api/campaigns/${campaign.id}/config`, { config: cfg }).then(
        (r) => r.json() as Promise<ConfigSaveResult>,
      ),
    onSuccess: (result) => {
      setConfirmOpen(false);
      if (result.recomputeStatus === "failed") {
        toast({ title: "Recompute failed", description: "Config saved, but evidence recompute failed. Retry from the menu.", variant: "destructive" });
      } else if (result.recomputeStatus === "done") {
        toast({ title: "Config saved", description: `Recomputed ${result.recomputed} pairs.` });
      } else {
        toast({ title: "Config saved" });
      }
      onOpenChange(false);
      onUpdate();
    },
    onError: () => {
      setConfirmOpen(false);
      toast({ title: "Error", description: "Failed to save campaign config.", variant: "destructive" });
    },
  });

  const trimmedName = name.trim();
  const nameValid = trimmedName.length > 0 && trimmedName.length <= 255;

  const detailsMutation = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", `/api/campaigns/${campaign.id}`, {
        name: trimmedName,
        description,
        instructions,
      }),
    onSuccess: () => {
      toast({ title: "Details saved" });
      // Refresh both detail keys (admin single-string + review-page array key)
      // and the list prefix so edited instructions appear without a hard reload.
      // See docs/solutions/.../getqueryfn-querykey-footgun.
      queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${campaign.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${campaign.id}`, "detail", campaign.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      onUpdate();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save campaign details.", variant: "destructive" });
    },
  });

  const handleSaveDetails = () => {
    if (!nameValid) {
      toast({ title: "Name required", description: "Enter a campaign name (1–255 characters).", variant: "destructive" });
      return;
    }
    detailsMutation.mutate();
  };

  const handleSave = () => {
    if (!configValid) {
      toast({ title: "Invalid configuration", description: "Fix the highlighted fields before saving.", variant: "destructive" });
      return;
    }
    if (hasVotes) {
      // Changing config can re-tier every reviewed pair — confirm before recompute.
      setConfirmOpen(true);
    } else {
      saveMutation.mutate(config);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configure Campaign</DialogTitle>
          <DialogDescription>{campaign.name}</DialogDescription>
        </DialogHeader>

        {staleRunning && (
          <div className="flex items-start gap-2 rounded-md border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm">
            <AlertTriangle className="w-4 h-4 mt-0.5 text-yellow-600" />
            <span>A previous recompute appears interrupted (status: running). Saving again will re-run it.</span>
          </div>
        )}
        {lastFailed && !staleRunning && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
            <AlertTriangle className="w-4 h-4 mt-0.5 text-destructive" />
            <span>The last recompute failed. Save again to retry.</span>
          </div>
        )}

        {/* Editable details — saved independently of the scoring/display config
            below so editing instructions never triggers an evidence recompute. */}
        <div className="space-y-4 rounded-md border border-border p-4">
          <div className="space-y-2">
            <Label htmlFor="edit-campaign-name">Campaign Name</Label>
            <Input
              id="edit-campaign-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={255}
              data-testid="input-edit-campaign-name"
            />
            {!nameValid && (
              <p className="text-xs text-destructive">A campaign name is required.</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-campaign-description">Description (Optional)</Label>
            <Textarea
              id="edit-campaign-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="resize-none"
              rows={3}
              maxLength={5000}
              data-testid="input-edit-campaign-description"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-campaign-instructions">Reviewer Instructions (Optional)</Label>
            <Textarea
              id="edit-campaign-instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              className="resize-none"
              rows={4}
              maxLength={2000}
              data-testid="input-edit-campaign-instructions"
            />
            <p className="text-xs text-muted-foreground">
              Shown to reviewers in a panel at the top of the review page.
            </p>
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={handleSaveDetails}
              disabled={detailsMutation.isPending || !nameValid}
              data-testid="button-save-details"
            >
              {detailsMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save details
            </Button>
          </div>
        </div>

        <CampaignConfigEditor value={config} onChange={setConfig} />

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={saveMutation.isPending || !configValid}
            data-testid="button-save-config"
          >
            {saveMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {lastFailed || staleRunning ? "Save & Retry Recompute" : "Save Config"}
          </Button>
        </DialogFooter>
      </DialogContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Recompute evidence status?</AlertDialogTitle>
            <AlertDialogDescription>
              This campaign has {campaign.reviewedPairs} reviewed of {campaign.totalPairs} pairs.
              Saving this config will recompute the evidence status for all {campaign.totalPairs} pairs
              under the new scoring and consensus settings. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saveMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                saveMutation.mutate(config);
              }}
              disabled={saveMutation.isPending}
              data-testid="button-confirm-recompute"
            >
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Recomputing…
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Save &amp; recompute
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

function CampaignCard({ campaign, onUpdate }: { campaign: CampaignWithStats; onUpdate: () => void }) {
  const { toast } = useToast();
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [rosterOpen, setRosterOpen] = useState(false);

  // Membership-derived roster — includes reviewers who joined but haven't voted
  // (the analytics Reviewers tab is vote-derived and can't show them). Single-
  // string key so getQueryFn hits the detail endpoint; only fetched when opened.
  const { data: roster, isLoading: rosterLoading } = useQuery<
    { userId: string; email: string; displayName: string | null; joinedAt: string }[]
  >({
    queryKey: [`/api/campaigns/${campaign.id}/roster`],
    enabled: rosterOpen,
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
                <DropdownMenuItem
                  onClick={() => setConfigDialogOpen(true)}
                  data-testid={`button-configure-${campaign.id}`}
                >
                  <Settings className="w-4 h-4 mr-2" />
                  Configure
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handleCopyLink}
                  data-testid={`button-copy-link-${campaign.id}`}
                >
                  <Link2 className="w-4 h-4 mr-2" />
                  Copy share link
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setRosterOpen(true)}
                  data-testid={`button-roster-${campaign.id}`}
                >
                  <Users className="w-4 h-4 mr-2" />
                  Reviewers
                </DropdownMenuItem>
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

        <div className="flex items-center gap-2 pt-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            asChild
            data-testid={`button-upload-pairs-${campaign.id}`}
          >
            <Link href={`/admin/campaigns/${campaign.id}/upload`}>
              <Upload className="w-4 h-4" />
              Upload Pairs
            </Link>
          </Button>
          {campaign.totalPairs > 0 && (
            <>
              <Button 
                variant="outline" 
                size="sm" 
                className="gap-2" 
                asChild
                data-testid={`button-browse-${campaign.id}`}
              >
                <Link href={`/admin/campaigns/${campaign.id}/results`}>
                  <Search className="w-4 h-4" />
                  Browse
                </Link>
              </Button>
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
            </>
          )}
        </div>
      </CardContent>
      <EditConfigDialog
        campaign={campaign}
        open={configDialogOpen}
        onOpenChange={setConfigDialogOpen}
        onUpdate={onUpdate}
      />
      <Dialog open={rosterOpen} onOpenChange={setRosterOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reviewers — {campaign.name}</DialogTitle>
            <DialogDescription>
              Experts who have joined this campaign via its share link.
            </DialogDescription>
          </DialogHeader>
          {rosterLoading ? (
            <div className="py-4 space-y-2">
              <Skeleton className="h-9" />
              <Skeleton className="h-9" />
            </div>
          ) : roster && roster.length > 0 ? (
            <div className="divide-y divide-border max-h-80 overflow-y-auto">
              {roster.map((m) => (
                <div
                  key={m.userId}
                  className="flex items-center justify-between gap-3 py-2"
                  data-testid={`roster-row-${m.userId}`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{m.displayName || m.email}</p>
                    <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {new Date(m.joinedAt).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-6 text-sm text-muted-foreground text-center">
              No one's joined this campaign yet. Share its link to invite reviewers.
            </p>
          )}
        </DialogContent>
      </Dialog>
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
    // Status/config/archive changes re-tier evidence and gate voting — refresh
    // the reviewer-facing lists too so they don't show stale state (#11).
    queryClient.invalidateQueries({ queryKey: ["/api/users/me/votes"] });
    queryClient.invalidateQueries({ queryKey: ["/api/users/me/stats"] });
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
                    Create your first campaign to start collecting expert feedback on mappings.
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
