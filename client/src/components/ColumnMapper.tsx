import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { AlertCircle } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type MappingEntry =
  | { type: "column" | "manual"; value: string }
  | { type: "none"; value: "" };

export type OptionalMappingEntry =
  | { type: "column" | "manual"; value: string }
  | { type: "none"; value: "" };

export interface ColumnMappings {
  // Required fields
  sourceText: MappingEntry;
  sourceId: MappingEntry;
  sourceDataset: MappingEntry;
  targetText: MappingEntry;
  targetId: MappingEntry;
  targetDataset: MappingEntry;
  pairType: MappingEntry;
  // Optional LLM fields
  llmConfidence?: OptionalMappingEntry;
  llmModel?: OptionalMappingEntry;
  llmReasoning?: OptionalMappingEntry;
  // Metadata / ignored
  sourceMetadataColumns: string[];
  targetMetadataColumns: string[];
  ignoredColumns: string[];
}

export interface ColumnMapperProps {
  columns: string[];
  mappings: ColumnMappings;
  onMappingsChange: (mappings: ColumnMappings) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MANUAL_SENTINEL = "__manual__";
const NONE_SENTINEL = "__none__";

/** Returns the set of columns currently assigned to any required/optional field. */
function getAssignedColumns(mappings: ColumnMappings): Set<string> {
  const assigned = new Set<string>();

  const fieldKeys: (keyof Pick<
    ColumnMappings,
    | "sourceText"
    | "sourceId"
    | "sourceDataset"
    | "targetText"
    | "targetId"
    | "targetDataset"
    | "pairType"
    | "llmConfidence"
    | "llmModel"
    | "llmReasoning"
  >)[] = [
    "sourceText",
    "sourceId",
    "sourceDataset",
    "targetText",
    "targetId",
    "targetDataset",
    "pairType",
    "llmConfidence",
    "llmModel",
    "llmReasoning",
  ];

  for (const key of fieldKeys) {
    const field = mappings[key];
    if (field && field.type === "column" && field.value) {
      assigned.add(field.value);
    }
  }
  for (const col of mappings.sourceMetadataColumns) {
    assigned.add(col);
  }
  for (const col of mappings.targetMetadataColumns) {
    assigned.add(col);
  }

  return assigned;
}

function fieldLabel(key: string): string {
  const labels: Record<string, string> = {
    sourceText: "Source Text",
    sourceId: "Source ID",
    sourceDataset: "Source Dataset",
    targetText: "Target Text",
    targetId: "Target ID",
    targetDataset: "Target Dataset",
    pairType: "Pair Type",
    llmConfidence: "LLM Confidence",
    llmModel: "LLM Model",
    llmReasoning: "LLM Reasoning",
  };
  return labels[key] ?? key;
}

function fieldDescription(key: string): string {
  const descs: Record<string, string> = {
    sourceText: "The display text for the source entity",
    sourceId: "Unique identifier of the source entity",
    sourceDataset: "Dataset or system the source belongs to",
    targetText: "The display text for the target entity",
    targetId: "Unique identifier of the target entity",
    targetDataset: "Dataset or system the target belongs to",
    pairType: "Classification type for this pair",
    llmConfidence: "LLM-predicted confidence score (0–1)",
    llmModel: "Name / version of the LLM used",
    llmReasoning: "LLM explanation for the mapping",
  };
  return descs[key] ?? "";
}

// ─── Sub-component: a single mapping row ─────────────────────────────────────

interface MappingRowProps {
  fieldKey: string;
  entry: MappingEntry | OptionalMappingEntry;
  columns: string[];
  isOptional?: boolean;
  onChange: (entry: MappingEntry | OptionalMappingEntry) => void;
}

function MappingRow({
  fieldKey,
  entry,
  columns,
  isOptional = false,
  onChange,
}: MappingRowProps) {
  const handleSelectChange = (val: string) => {
    if (val === NONE_SENTINEL) {
      onChange({ type: "none", value: "" });
    } else if (val === MANUAL_SENTINEL) {
      onChange({ type: "manual", value: "" });
    } else {
      onChange({ type: "column", value: val });
    }
  };

  const selectValue =
    entry.type === "none"
      ? NONE_SENTINEL
      : entry.type === "manual"
      ? MANUAL_SENTINEL
      : entry.value || "";

  const isValid =
    (entry.type === "column" && entry.value !== "") ||
    (entry.type === "manual" && entry.value !== "") ||
    (isOptional && entry.type === "none");

  return (
    <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] items-start gap-x-4 gap-y-1 py-2">
      {/* Label column */}
      <div className="pt-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-foreground">
            {fieldLabel(fieldKey)}
          </span>
          {!isOptional && (
            <span className="text-destructive text-xs font-bold" title="Required">
              *
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
          {fieldDescription(fieldKey)}
        </p>
      </div>

      {/* Control column */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <Select value={selectValue} onValueChange={handleSelectChange}>
            <SelectTrigger
              className="flex-1 min-w-0"
              data-testid={`select-mapping-${fieldKey}`}
            >
              <SelectValue placeholder="Select a column..." />
            </SelectTrigger>
            <SelectContent>
              {/* File columns */}
              {columns.length > 0 && (
                <>
                  {columns.map((col) => (
                    <SelectItem key={col} value={col}>
                      <span className="font-mono text-xs">{col}</span>
                    </SelectItem>
                  ))}
                  <SelectSeparator />
                </>
              )}
              <SelectItem value={MANUAL_SENTINEL}>
                <span className="text-muted-foreground italic">
                  — Manual entry —
                </span>
              </SelectItem>
              {isOptional && (
                <SelectItem value={NONE_SENTINEL}>
                  <span className="text-muted-foreground italic">
                    — Skip this field —
                  </span>
                </SelectItem>
              )}
            </SelectContent>
          </Select>

          {/* Validation indicator */}
          {!isValid && !isOptional && (
            <AlertCircle
              className="w-4 h-4 text-destructive shrink-0"
              aria-label="Required field not mapped"
            />
          )}
        </div>

        {/* Manual input */}
        {entry.type === "manual" && (
          <Input
            placeholder={`Enter a fixed value for ${fieldLabel(fieldKey)}...`}
            value={entry.value}
            onChange={(e) =>
              onChange({ type: "manual", value: e.target.value })
            }
            className="text-sm"
            data-testid={`input-manual-${fieldKey}`}
          />
        )}
      </div>
    </div>
  );
}

// ─── Sub-component: metadata column assignment ────────────────────────────────

interface MetadataColumnRowProps {
  column: string;
  sourceChecked: boolean;
  targetChecked: boolean;
  onSourceChange: (checked: boolean) => void;
  onTargetChange: (checked: boolean) => void;
}

function MetadataColumnRow({
  column,
  sourceChecked,
  targetChecked,
  onSourceChange,
  onTargetChange,
}: MetadataColumnRowProps) {
  return (
    <div className="flex items-center gap-4 py-1.5">
      <span className="flex-1 font-mono text-xs text-foreground truncate" title={column}>
        {column}
      </span>
      <div className="flex items-center gap-1.5">
        <Checkbox
          id={`src-meta-${column}`}
          checked={sourceChecked}
          onCheckedChange={(val) => onSourceChange(val === true)}
          data-testid={`checkbox-source-meta-${column}`}
        />
        <Label
          htmlFor={`src-meta-${column}`}
          className="text-xs text-muted-foreground cursor-pointer select-none"
        >
          Source
        </Label>
      </div>
      <div className="flex items-center gap-1.5">
        <Checkbox
          id={`tgt-meta-${column}`}
          checked={targetChecked}
          onCheckedChange={(val) => onTargetChange(val === true)}
          data-testid={`checkbox-target-meta-${column}`}
        />
        <Label
          htmlFor={`tgt-meta-${column}`}
          className="text-xs text-muted-foreground cursor-pointer select-none"
        >
          Target
        </Label>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const REQUIRED_FIELDS: (keyof Pick<
  ColumnMappings,
  | "sourceText"
  | "sourceId"
  | "sourceDataset"
  | "targetText"
  | "targetId"
  | "targetDataset"
  | "pairType"
>)[] = [
  "sourceText",
  "sourceId",
  "sourceDataset",
  "targetText",
  "targetId",
  "targetDataset",
  "pairType",
];

const OPTIONAL_FIELDS: (keyof Pick<
  ColumnMappings,
  "llmConfidence" | "llmModel" | "llmReasoning"
>)[] = ["llmConfidence", "llmModel", "llmReasoning"];

export function ColumnMapper({
  columns,
  mappings,
  onMappingsChange,
}: ColumnMapperProps) {
  const assignedColumns = getAssignedColumns(mappings);

  // Columns not used in required/optional mappings — available for metadata or ignored
  const unmappedColumns = columns.filter((col) => !assignedColumns.has(col));

  // ── Required field handlers ──────────────────────────────────────────────

  const handleRequiredChange =
    (key: keyof Pick<
      ColumnMappings,
      | "sourceText"
      | "sourceId"
      | "sourceDataset"
      | "targetText"
      | "targetId"
      | "targetDataset"
      | "pairType"
    >) =>
    (entry: MappingEntry | OptionalMappingEntry) => {
      onMappingsChange({ ...mappings, [key]: entry });
    };

  // ── Optional field handlers ──────────────────────────────────────────────

  const handleOptionalChange =
    (key: "llmConfidence" | "llmModel" | "llmReasoning") =>
    (entry: MappingEntry | OptionalMappingEntry) => {
      onMappingsChange({ ...mappings, [key]: entry });
    };

  // ── Metadata checkbox handlers ───────────────────────────────────────────

  const handleSourceMetaChange = (column: string, checked: boolean) => {
    const current = new Set(mappings.sourceMetadataColumns);
    if (checked) {
      current.add(column);
    } else {
      current.delete(column);
    }
    // Remove from target metadata if also checked there (mutually exclusive with source for simplicity)
    const targetMeta = new Set(mappings.targetMetadataColumns);
    onMappingsChange({
      ...mappings,
      sourceMetadataColumns: Array.from(current),
      targetMetadataColumns: Array.from(targetMeta),
    });
  };

  const handleTargetMetaChange = (column: string, checked: boolean) => {
    const current = new Set(mappings.targetMetadataColumns);
    if (checked) {
      current.add(column);
    } else {
      current.delete(column);
    }
    const sourceMeta = new Set(mappings.sourceMetadataColumns);
    onMappingsChange({
      ...mappings,
      sourceMetadataColumns: Array.from(sourceMeta),
      targetMetadataColumns: Array.from(current),
    });
  };

  // Columns that are assigned to field mappings — not available for metadata
  const allAssignedToFields = getAssignedColumns({
    ...mappings,
    sourceMetadataColumns: [],
    targetMetadataColumns: [],
  });

  // Columns that can appear in the metadata section (not mapped to a named field)
  const metadataEligibleColumns = columns.filter(
    (col) => !allAssignedToFields.has(col)
  );

  // Fully ignored = not mapped anywhere
  const fullyIgnored = columns.filter(
    (col) =>
      !allAssignedToFields.has(col) &&
      !mappings.sourceMetadataColumns.includes(col) &&
      !mappings.targetMetadataColumns.includes(col)
  );

  return (
    <div className="space-y-6">
      {/* ── Required Mappings ─────────────────────────────────────────────── */}
      <div className="space-y-1">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-semibold text-foreground">
            Required Mappings
          </h3>
          <Badge variant="secondary" className="text-xs">
            {REQUIRED_FIELDS.filter((k) => {
              const f = mappings[k];
              return (
                (f.type === "column" && f.value !== "") ||
                (f.type === "manual" && f.value !== "")
              );
            }).length}{" "}
            / {REQUIRED_FIELDS.length}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Map each required field to a column in the file, or enter a fixed
          value that will apply to every row.
        </p>

        <div className="divide-y divide-border rounded-lg border border-border bg-card px-4">
          {REQUIRED_FIELDS.map((key) => (
            <MappingRow
              key={key}
              fieldKey={key}
              entry={mappings[key]}
              columns={columns}
              isOptional={false}
              onChange={handleRequiredChange(key)}
            />
          ))}
        </div>
      </div>

      <Separator />

      {/* ── Optional Mappings ─────────────────────────────────────────────── */}
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground mb-1">
          LLM Metadata (Optional)
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          If your file contains LLM-generated metadata, map or skip these fields.
        </p>

        <div className="divide-y divide-border rounded-lg border border-border bg-card px-4">
          {OPTIONAL_FIELDS.map((key) => {
            const entry: OptionalMappingEntry = mappings[key] ?? {
              type: "none",
              value: "",
            };
            return (
              <MappingRow
                key={key}
                fieldKey={key}
                entry={entry}
                columns={columns}
                isOptional={true}
                onChange={handleOptionalChange(key)}
              />
            );
          })}
        </div>
      </div>

      <Separator />

      {/* ── Additional Metadata ────────────────────────────────────────────── */}
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground mb-1">
          Additional Metadata Columns
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          Select unmapped columns to include as structured metadata attached to
          the source or target entity.
        </p>

        {metadataEligibleColumns.length > 0 ? (
          <div className="rounded-lg border border-border bg-card divide-y divide-border">
            {/* Header */}
            <div className="flex items-center gap-4 px-4 py-2 bg-muted/40">
              <span className="flex-1 text-xs font-medium text-muted-foreground">
                Column
              </span>
              <span className="text-xs font-medium text-muted-foreground w-16 text-center">
                Source
              </span>
              <span className="text-xs font-medium text-muted-foreground w-14 text-center">
                Target
              </span>
            </div>
            <div className="px-4 divide-y divide-border">
              {metadataEligibleColumns.map((col) => (
                <MetadataColumnRow
                  key={col}
                  column={col}
                  sourceChecked={mappings.sourceMetadataColumns.includes(col)}
                  targetChecked={mappings.targetMetadataColumns.includes(col)}
                  onSourceChange={(checked) =>
                    handleSourceMetaChange(col, checked)
                  }
                  onTargetChange={(checked) =>
                    handleTargetMetaChange(col, checked)
                  }
                />
              ))}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground py-2">
            No unmapped columns available. All columns are already assigned to a
            field above.
          </p>
        )}
      </div>

      {/* ── Ignored Columns ────────────────────────────────────────────────── */}
      {fullyIgnored.length > 0 && (
        <>
          <Separator />
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-muted-foreground mb-1">
              Ignored Columns
            </h3>
            <p className="text-xs text-muted-foreground mb-3">
              These columns are not mapped to any field and will be discarded
              during import.
            </p>
            <div className="flex flex-wrap gap-2">
              {fullyIgnored.map((col) => (
                <Badge
                  key={col}
                  variant="outline"
                  className="font-mono text-xs text-muted-foreground"
                >
                  {col}
                </Badge>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Returns default mappings with all required fields unset. */
export function createDefaultMappings(columns: string[]): ColumnMappings {
  const blankEntry: MappingEntry = { type: "column", value: "" };
  const blankOptional: OptionalMappingEntry = { type: "none", value: "" };

  // Auto-detect common column name patterns
  const find = (...candidates: string[]) =>
    candidates.find((c) => columns.includes(c)) ?? "";

  const autoSourceText = find(
    "source_text",
    "sourceText",
    "source_name",
    "sourceName",
    "question_text",
    "source"
  );
  const autoSourceId = find(
    "source_id",
    "sourceId",
    "source_code",
    "sourceCode",
    "questionnaire_item_id"
  );
  const autoSourceDataset = find(
    "source_dataset",
    "sourceDataset",
    "source_system",
    "dataset"
  );
  const autoTargetText = find(
    "target_text",
    "targetText",
    "target_name",
    "targetName",
    "loinc_name",
    "target"
  );
  const autoTargetId = find(
    "target_id",
    "targetId",
    "target_code",
    "targetCode",
    "loinc_code"
  );
  const autoTargetDataset = find(
    "target_dataset",
    "targetDataset",
    "target_system"
  );
  const autoPairType = find("pair_type", "pairType", "type", "mapping_type");
  const autoLlmConfidence = find(
    "llm_confidence",
    "llmConfidence",
    "confidence",
    "score"
  );
  const autoLlmModel = find("llm_model", "llmModel", "model");
  const autoLlmReasoning = find(
    "llm_reasoning",
    "llmReasoning",
    "reasoning",
    "explanation"
  );

  const toEntry = (value: string): MappingEntry =>
    value ? { type: "column", value } : { ...blankEntry };

  const toOptional = (value: string): OptionalMappingEntry =>
    value ? { type: "column", value } : { ...blankOptional };

  const assignedValues = [
    autoSourceText,
    autoSourceId,
    autoSourceDataset,
    autoTargetText,
    autoTargetId,
    autoTargetDataset,
    autoPairType,
    autoLlmConfidence,
    autoLlmModel,
    autoLlmReasoning,
  ].filter(Boolean);

  const unassigned = columns.filter((c) => !assignedValues.includes(c));

  return {
    sourceText: toEntry(autoSourceText),
    sourceId: toEntry(autoSourceId),
    sourceDataset: toEntry(autoSourceDataset),
    targetText: toEntry(autoTargetText),
    targetId: toEntry(autoTargetId),
    targetDataset: toEntry(autoTargetDataset),
    pairType: toEntry(autoPairType),
    llmConfidence: toOptional(autoLlmConfidence),
    llmModel: toOptional(autoLlmModel),
    llmReasoning: toOptional(autoLlmReasoning),
    sourceMetadataColumns: [],
    targetMetadataColumns: [],
    ignoredColumns: unassigned,
  };
}

/** Returns true when all required fields have a non-empty mapping. */
export function isMappingComplete(mappings: ColumnMappings): boolean {
  return REQUIRED_FIELDS.every((key) => {
    const f = mappings[key];
    return (
      (f.type === "column" && f.value !== "") ||
      (f.type === "manual" && f.value !== "")
    );
  });
}
