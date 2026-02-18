import { useState, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Upload,
  FileUp,
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  Check,
  Loader2,
  BookTemplate,
  Save,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import type { Campaign, ImportTemplate } from "@shared/schema";
import {
  ColumnMapper,
  type ColumnMappings,
  createDefaultMappings,
  isMappingComplete,
} from "@/components/ColumnMapper";
import { MappingPreview } from "@/components/MappingPreview";
import { FilePreview } from "@/components/FilePreview";

// ─── Types ────────────────────────────────────────────────────────────────────

type WizardStep = 1 | 2 | 3;

type ParsedData = {
  columns: string[];
  rows: Record<string, string>[];
};

type ImportResult = {
  success: boolean;
  count: number;
  message?: string;
};

// ─── CSV Parsing Utility ──────────────────────────────────────────────────────

function detectDelimiter(firstLine: string): "," | "\t" {
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  return tabCount > commaCount ? "\t" : ",";
}

function parseCSV(
  text: string,
  delimiter: "," | "\t"
): { columns: string[]; rows: Record<string, string>[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return { columns: [], rows: [] };

  // Parse a single line respecting quoted fields
  const parseLine = (line: string): string[] => {
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          // Check for escaped quote
          if (i + 1 < line.length && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === delimiter) {
          fields.push(current.trim());
          current = "";
        } else {
          current += ch;
        }
      }
    }
    fields.push(current.trim());
    return fields;
  };

  const columns = parseLine(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]);
    const row: Record<string, string> = {};
    columns.forEach((col, idx) => {
      row[col] = values[idx] ?? "";
    });
    rows.push(row);
  }

  return { columns, rows };
}

// ─── Transform rows to pair objects using mappings ────────────────────────────

function resolveEntryValue(
  row: Record<string, string>,
  entry: { type: "column" | "manual" | "none"; value: string } | undefined
): string {
  if (!entry || entry.type === "none") return "";
  if (entry.type === "manual") return entry.value;
  return row[entry.value] ?? "";
}

function transformRowsToPairs(
  rows: Record<string, string>[],
  mappings: ColumnMappings,
  campaignType: string
) {
  return rows.map((row) => {
    const sourceMetadata: Record<string, string> = {};
    for (const col of mappings.sourceMetadataColumns) {
      if (row[col] !== undefined && row[col] !== "") {
        sourceMetadata[col] = row[col];
      }
    }

    const targetMetadata: Record<string, string> = {};
    for (const col of mappings.targetMetadataColumns) {
      if (row[col] !== undefined && row[col] !== "") {
        targetMetadata[col] = row[col];
      }
    }

    const pairType = resolveEntryValue(row, mappings.pairType) || campaignType;
    const llmConfidence = resolveEntryValue(row, mappings.llmConfidence);

    return {
      source_text: resolveEntryValue(row, mappings.sourceText),
      source_id: resolveEntryValue(row, mappings.sourceId),
      source_dataset: resolveEntryValue(row, mappings.sourceDataset),
      target_text: resolveEntryValue(row, mappings.targetText),
      target_id: resolveEntryValue(row, mappings.targetId),
      target_dataset: resolveEntryValue(row, mappings.targetDataset),
      pair_type: pairType,
      llm_confidence: llmConfidence !== "" ? llmConfidence : undefined,
      llm_model: resolveEntryValue(row, mappings.llmModel) || undefined,
      llm_reasoning: resolveEntryValue(row, mappings.llmReasoning) || undefined,
      source_metadata:
        Object.keys(sourceMetadata).length > 0 ? sourceMetadata : undefined,
      target_metadata:
        Object.keys(targetMetadata).length > 0 ? targetMetadata : undefined,
    };
  });
}

// ─── Step Indicator ───────────────────────────────────────────────────────────

function StepIndicator({ step }: { step: WizardStep }) {
  const steps = [
    { number: 1, label: "Upload File" },
    { number: 2, label: "Map Columns" },
    { number: 3, label: "Results" },
  ];

  return (
    <div className="flex items-center gap-0">
      {steps.map((s, idx) => (
        <div key={s.number} className="flex items-center">
          <div className="flex items-center gap-2">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                step > s.number
                  ? "bg-primary text-primary-foreground"
                  : step === s.number
                  ? "bg-primary text-primary-foreground ring-2 ring-primary/30"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {step > s.number ? (
                <Check className="w-3.5 h-3.5" />
              ) : (
                s.number
              )}
            </div>
            <span
              className={`text-sm font-medium ${
                step === s.number
                  ? "text-foreground"
                  : "text-muted-foreground"
              }`}
            >
              {s.label}
            </span>
          </div>
          {idx < steps.length - 1 && (
            <div className="w-8 h-px bg-border mx-3" />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Save Template Dialog ─────────────────────────────────────────────────────

function SaveTemplateDialog({
  open,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (name: string, description: string) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const handleSave = () => {
    if (!name.trim()) return;
    onSave(name.trim(), description.trim());
    setName("");
    setDescription("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Save as Template</DialogTitle>
          <DialogDescription>
            Save the current column mappings as a reusable template for future imports.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="template-name">Template Name</Label>
            <Input
              id="template-name"
              placeholder="e.g., LOINC Mapping Standard"
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="input-template-name"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="template-description">
              Description{" "}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Textarea
              id="template-description"
              placeholder="Brief description of when to use this template..."
              rows={2}
              className="resize-none"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              data-testid="input-template-description"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!name.trim()}
            data-testid="button-save-template-confirm"
          >
            Save Template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Step 1: File Upload ───────────────────────────────────────────────────────

function FileUploadStep({
  file,
  parsedData,
  delimiter,
  onFileChange,
  onNext,
}: {
  file: File | null;
  parsedData: ParsedData | null;
  delimiter: "," | "\t";
  onFileChange: (file: File | null) => void;
  onNext: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (selectedFile: File) => {
    onFileChange(selectedFile);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files[0];
    if (
      dropped &&
      (dropped.name.endsWith(".csv") || dropped.name.endsWith(".tsv"))
    ) {
      handleFileSelect(dropped);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  return (
    <div className="space-y-6">
      {/* Drop zone */}
      <div
        className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer ${
          file
            ? "border-primary/40 bg-primary/5"
            : "border-border hover:border-primary/40 hover:bg-muted/30"
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onClick={() => fileInputRef.current?.click()}
        data-testid="dropzone-file"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.tsv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFileSelect(f);
          }}
          data-testid="input-file-upload"
        />
        <FileUp className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
        {file ? (
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">{file.name}</p>
            <p className="text-xs text-muted-foreground">
              Click to select a different file
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">
              Click to upload or drag and drop
            </p>
            <p className="text-xs text-muted-foreground">
              Supports .csv and .tsv files
            </p>
          </div>
        )}
      </div>

      {/* File preview */}
      {file && parsedData && parsedData.rows.length > 0 && (
        <FilePreview
          file={file}
          rows={parsedData.rows}
          delimiter={delimiter}
        />
      )}

      {/* Error state */}
      {file && parsedData && parsedData.rows.length === 0 && (
        <div className="flex items-center gap-2 p-4 rounded-lg border border-destructive/30 bg-destructive/5">
          <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive">
            No data rows found in the file. Please check the file format.
          </p>
        </div>
      )}

      {/* Next button */}
      <div className="flex justify-end">
        <Button
          onClick={onNext}
          disabled={!file || !parsedData || parsedData.rows.length === 0}
          className="gap-2"
          data-testid="button-next-to-mapping"
        >
          Continue to Mapping
          <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Step 2: Column Mapping ────────────────────────────────────────────────────

function ColumnMappingStep({
  parsedData,
  file,
  delimiter,
  mappings,
  onMappingsChange,
  onBack,
  onImport,
  importing,
  campaignId,
}: {
  parsedData: ParsedData;
  file: File;
  delimiter: "," | "\t";
  mappings: ColumnMappings;
  onMappingsChange: (m: ColumnMappings) => void;
  onBack: () => void;
  onImport: () => void;
  importing: boolean;
  campaignId: string;
}) {
  const { toast } = useToast();
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

  const { data: templates = [] } = useQuery<ImportTemplate[]>({
    queryKey: ["/api/import-templates"],
  });

  const saveTemplateMutation = useMutation({
    mutationFn: (data: {
      name: string;
      description: string;
      columnMappings: ColumnMappings;
    }) =>
      apiRequest("POST", "/api/import-templates", {
        name: data.name,
        description: data.description || null,
        columnMappings: data.columnMappings,
      }),
    onSuccess: () => {
      toast({
        title: "Template saved",
        description: "Column mappings saved as a reusable template.",
      });
    },
    onError: () => {
      toast({
        title: "Save failed",
        description: "Could not save the template.",
        variant: "destructive",
      });
    },
  });

  const handleLoadTemplate = (templateId: string) => {
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;

    // The stored columnMappings must conform to the ColumnMappings shape
    const stored = template.columnMappings as unknown as ColumnMappings;
    if (stored && typeof stored === "object") {
      onMappingsChange(stored);
      toast({
        title: "Template loaded",
        description: `Applied mappings from "${template.name}".`,
      });
    }
  };

  const handleSaveTemplate = (name: string, description: string) => {
    saveTemplateMutation.mutate({ name, description, columnMappings: mappings });
  };

  const canImport = isMappingComplete(mappings);

  return (
    <div className="space-y-6">
      {/* Template toolbar */}
      <div className="flex flex-wrap items-center gap-3 p-3 bg-muted/40 rounded-lg border border-border">
        <BookTemplate className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium text-foreground">Templates</span>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Select
            value={selectedTemplateId}
            onValueChange={(val) => {
              setSelectedTemplateId(val);
              handleLoadTemplate(val);
            }}
          >
            <SelectTrigger
              className="flex-1 min-w-[180px] max-w-xs"
              data-testid="select-template"
            >
              <SelectValue placeholder="Load a saved template..." />
            </SelectTrigger>
            <SelectContent>
              {templates.length === 0 ? (
                <SelectItem value="__empty__" disabled>
                  No templates saved yet
                </SelectItem>
              ) : (
                templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 shrink-0"
          onClick={() => setSaveTemplateOpen(true)}
          data-testid="button-save-template"
        >
          <Save className="w-3.5 h-3.5" />
          Save as Template
        </Button>
      </div>

      {/* Column mapper */}
      <Card className="border-card-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">Column Mappings</CardTitle>
          <CardDescription>
            Map columns from {file.name} to the required fields.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ColumnMapper
            columns={parsedData.columns}
            mappings={mappings}
            onMappingsChange={onMappingsChange}
          />
        </CardContent>
      </Card>

      {/* File preview with mapping highlights */}
      <FilePreview
        file={file}
        rows={parsedData.rows}
        delimiter={delimiter}
        mappings={mappings}
      />

      {/* Mapping preview */}
      <MappingPreview rows={parsedData.rows} mappings={mappings} />

      {/* Validation warning */}
      {!canImport && (
        <div className="flex items-center gap-2 p-3 rounded-lg border border-destructive/30 bg-destructive/5">
          <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive">
            All required fields must be mapped before importing.
          </p>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={onBack}
          className="gap-2"
          data-testid="button-back-to-upload"
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </Button>
        <Button
          onClick={onImport}
          disabled={!canImport || importing}
          className="gap-2"
          data-testid="button-import"
        >
          {importing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Importing...
            </>
          ) : (
            <>
              <Upload className="w-4 h-4" />
              Import {parsedData.rows.length} Pairs
            </>
          )}
        </Button>
      </div>

      <SaveTemplateDialog
        open={saveTemplateOpen}
        onOpenChange={setSaveTemplateOpen}
        onSave={handleSaveTemplate}
      />
    </div>
  );
}

// ─── Step 3: Import Results ────────────────────────────────────────────────────

function ImportResultsStep({
  result,
  campaignId,
  onImportMore,
}: {
  result: ImportResult;
  campaignId: string;
  onImportMore: () => void;
}) {
  const [, navigate] = useLocation();

  return (
    <div className="space-y-6">
      <Card className="border-card-border">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center text-center space-y-4 py-4">
            {result.success ? (
              <>
                <div className="w-14 h-14 rounded-full bg-green-500/10 flex items-center justify-center">
                  <CheckCircle2 className="w-7 h-7 text-green-600 dark:text-green-400" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-lg font-semibold text-foreground">
                    Import Successful
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Successfully imported{" "}
                    <span className="font-semibold text-foreground">
                      {result.count}
                    </span>{" "}
                    {result.count === 1 ? "pair" : "pairs"} into the campaign.
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
                  <AlertCircle className="w-7 h-7 text-destructive" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-lg font-semibold text-foreground">
                    Import Failed
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {result.message || "An error occurred during import."}
                  </p>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col sm:flex-row items-center gap-3 justify-center">
        <Button
          variant="outline"
          onClick={onImportMore}
          className="gap-2 w-full sm:w-auto"
          data-testid="button-import-more"
        >
          <RefreshCw className="w-4 h-4" />
          Import More Pairs
        </Button>
        <Button
          onClick={() =>
            navigate(`/admin/campaigns/${campaignId}/results`)
          }
          className="gap-2 w-full sm:w-auto"
          data-testid="button-view-campaign"
        >
          View Campaign Results
          <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Main Upload Page ─────────────────────────────────────────────────────────

export default function UploadPage() {
  const { id: campaignId } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClientHook = useQueryClient();

  // Wizard state
  const [step, setStep] = useState<WizardStep>(1);
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [delimiter, setDelimiter] = useState<"," | "\t">(",");
  const [mappings, setMappings] = useState<ColumnMappings | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  // Fetch campaign details
  const { data: campaign } = useQuery<Campaign>({
    queryKey: [`/api/campaigns/${campaignId}`],
    enabled: !!campaignId,
  });

  // Handle file selection and parsing
  const handleFileChange = (selectedFile: File | null) => {
    if (!selectedFile) {
      setFile(null);
      setParsedData(null);
      setMappings(null);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) return;

      const firstLine = text.split(/\r?\n/)[0] || "";
      const detectedDelimiter = detectDelimiter(firstLine);
      setDelimiter(detectedDelimiter);

      const parsed = parseCSV(text, detectedDelimiter);
      setFile(selectedFile);
      setParsedData(parsed);

      // Auto-detect mappings
      const autoMappings = createDefaultMappings(parsed.columns);
      setMappings(autoMappings);
    };
    reader.readAsText(selectedFile);
  };

  // Import handler
  const handleImport = async () => {
    if (!parsedData || !mappings || !campaignId) return;

    setImporting(true);
    try {
      const pairs = transformRowsToPairs(
        parsedData.rows,
        mappings,
        campaign?.campaignType ?? "loinc_mapping"
      );

      const response = await apiRequest(
        "POST",
        `/api/campaigns/${campaignId}/pairs`,
        { pairs }
      );
      const data = await response.json();

      setImportResult({ success: true, count: data.count ?? pairs.length });
      setStep(3);

      // Invalidate campaign queries so stats refresh
      queryClientHook.invalidateQueries({ queryKey: ["/api/campaigns"] });
      queryClientHook.invalidateQueries({
        queryKey: [`/api/campaigns/${campaignId}`],
      });
    } catch (err: any) {
      const message =
        err?.message || "An unexpected error occurred during import.";
      setImportResult({ success: false, count: 0, message });
      setStep(3);
    } finally {
      setImporting(false);
    }
  };

  // Reset wizard for another import
  const handleImportMore = () => {
    setStep(1);
    setFile(null);
    setParsedData(null);
    setMappings(null);
    setImportResult(null);
  };

  const handleNextFromStep1 = () => {
    setStep(2);
  };

  const handleBackToStep1 = () => {
    setStep(1);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/admin/campaigns")}
            className="gap-2 text-muted-foreground hover:text-foreground"
            data-testid="button-back-to-campaigns"
          >
            <ArrowLeft className="w-4 h-4" />
            Campaigns
          </Button>
          <Separator orientation="vertical" className="h-5" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-semibold text-foreground">
                Import Pairs
              </h1>
              {campaign && (
                <Badge variant="outline" className="font-normal text-xs">
                  {campaign.name}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Upload a CSV or TSV file and map columns to import entity pairs.
            </p>
          </div>
        </div>

        {/* Step indicator */}
        <StepIndicator step={step} />

        {/* Step content */}
        <div className="min-h-[400px]">
          {step === 1 && (
            <FileUploadStep
              file={file}
              parsedData={parsedData}
              delimiter={delimiter}
              onFileChange={handleFileChange}
              onNext={handleNextFromStep1}
            />
          )}

          {step === 2 && parsedData && file && mappings && (
            <ColumnMappingStep
              parsedData={parsedData}
              file={file}
              delimiter={delimiter}
              mappings={mappings}
              onMappingsChange={setMappings}
              onBack={handleBackToStep1}
              onImport={handleImport}
              importing={importing}
              campaignId={campaignId ?? ""}
            />
          )}

          {step === 3 && importResult && (
            <ImportResultsStep
              result={importResult}
              campaignId={campaignId ?? ""}
              onImportMore={handleImportMore}
            />
          )}
        </div>
      </div>
    </div>
  );
}
