import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AlertCircle, ArrowRight } from "lucide-react";
import type { ColumnMappings } from "@/components/ColumnMapper";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MappingPreviewProps {
  rows: Record<string, string>[];
  mappings: ColumnMappings;
}

interface ResolvedPair {
  sourceText: string;
  sourceId: string;
  sourceDataset: string;
  targetText: string;
  targetId: string;
  targetDataset: string;
  pairType: string;
  llmConfidence: string;
  llmModel: string;
  llmReasoning: string;
  sourceMetadata: Record<string, string>;
  targetMetadata: Record<string, string>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveValue(
  row: Record<string, string>,
  entry: { type: "column" | "manual" | "none"; value: string } | undefined
): string {
  if (!entry || entry.type === "none") return "";
  if (entry.type === "manual") return entry.value;
  return row[entry.value] ?? "";
}

function resolvePair(
  row: Record<string, string>,
  mappings: ColumnMappings
): ResolvedPair {
  const sourceMetadata: Record<string, string> = {};
  for (const col of mappings.sourceMetadataColumns) {
    sourceMetadata[col] = row[col] ?? "";
  }

  const targetMetadata: Record<string, string> = {};
  for (const col of mappings.targetMetadataColumns) {
    targetMetadata[col] = row[col] ?? "";
  }

  return {
    sourceText: resolveValue(row, mappings.sourceText),
    sourceId: resolveValue(row, mappings.sourceId),
    sourceDataset: resolveValue(row, mappings.sourceDataset),
    targetText: resolveValue(row, mappings.targetText),
    targetId: resolveValue(row, mappings.targetId),
    targetDataset: resolveValue(row, mappings.targetDataset),
    pairType: resolveValue(row, mappings.pairType),
    llmConfidence: resolveValue(row, mappings.llmConfidence),
    llmModel: resolveValue(row, mappings.llmModel),
    llmReasoning: resolveValue(row, mappings.llmReasoning),
    sourceMetadata,
    targetMetadata,
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function EntityBlock({
  label,
  text,
  id,
  dataset,
  metadata,
  side,
}: {
  label: string;
  text: string;
  id: string;
  dataset: string;
  metadata: Record<string, string>;
  side: "source" | "target";
}) {
  const accentClass =
    side === "source"
      ? "border-l-blue-500 bg-blue-500/5"
      : "border-l-purple-500 bg-purple-500/5";
  const labelClass =
    side === "source" ? "text-blue-600 dark:text-blue-400" : "text-purple-600 dark:text-purple-400";

  const metaEntries = Object.entries(metadata).filter(([, v]) => v !== "");

  return (
    <div className={`flex-1 rounded-lg border-l-4 p-3 space-y-1.5 ${accentClass}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-xs font-semibold uppercase tracking-wide ${labelClass}`}>
          {label}
        </span>
        {dataset && (
          <Badge variant="secondary" className="text-xs font-mono">
            {dataset}
          </Badge>
        )}
      </div>

      {text ? (
        <p className="text-sm text-foreground font-medium leading-snug">{text}</p>
      ) : (
        <p className="text-sm text-muted-foreground italic">— no text mapped —</p>
      )}

      {id && (
        <p className="text-xs font-mono text-muted-foreground">ID: {id}</p>
      )}

      {metaEntries.length > 0 && (
        <div className="pt-1 space-y-0.5">
          {metaEntries.map(([k, v]) => (
            <div key={k} className="flex gap-1.5 text-xs">
              <span className="text-muted-foreground font-mono shrink-0">{k}:</span>
              <span className="text-foreground truncate">{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LlmBlock({
  confidence,
  model,
  reasoning,
}: {
  confidence: string;
  model: string;
  reasoning: string;
}) {
  if (!confidence && !model && !reasoning) return null;

  return (
    <div className="rounded-md border border-border bg-muted/30 px-3 py-2 space-y-1">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        LLM Metadata
      </span>
      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
        {model && (
          <span>
            <span className="text-muted-foreground">Model: </span>
            <span className="font-mono text-foreground">{model}</span>
          </span>
        )}
        {confidence && (
          <span>
            <span className="text-muted-foreground">Confidence: </span>
            <span className="font-mono text-foreground">{confidence}</span>
          </span>
        )}
      </div>
      {reasoning && (
        <p className="text-xs text-muted-foreground italic leading-snug line-clamp-2">
          {reasoning}
        </p>
      )}
    </div>
  );
}

function PairCard({
  pair,
  index,
}: {
  pair: ResolvedPair;
  index: number;
}) {
  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      {/* Card header */}
      <div className="flex items-center justify-between gap-2 px-4 py-2 bg-muted/40 border-b border-border">
        <span className="text-xs text-muted-foreground font-medium">
          Row {index + 1}
        </span>
        {pair.pairType && (
          <Badge variant="outline" className="text-xs font-mono">
            {pair.pairType}
          </Badge>
        )}
      </div>

      {/* Entities */}
      <div className="p-3 space-y-3">
        <div className="flex items-stretch gap-2">
          <EntityBlock
            label="Source"
            text={pair.sourceText}
            id={pair.sourceId}
            dataset={pair.sourceDataset}
            metadata={pair.sourceMetadata}
            side="source"
          />
          <div className="flex items-center shrink-0 self-center">
            <ArrowRight className="w-4 h-4 text-muted-foreground" />
          </div>
          <EntityBlock
            label="Target"
            text={pair.targetText}
            id={pair.targetId}
            dataset={pair.targetDataset}
            metadata={pair.targetMetadata}
            side="target"
          />
        </div>

        <LlmBlock
          confidence={pair.llmConfidence}
          model={pair.llmModel}
          reasoning={pair.llmReasoning}
        />
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

function isMappingPartiallyComplete(mappings: ColumnMappings): boolean {
  const required: (keyof Pick<
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

  return required.some((key) => {
    const f = mappings[key];
    return (
      (f.type === "column" && f.value !== "") ||
      (f.type === "manual" && f.value !== "")
    );
  });
}

export function MappingPreview({ rows, mappings }: MappingPreviewProps) {
  const previewRows = rows.slice(0, 3);
  const hasAnyMapping = isMappingPartiallyComplete(mappings);

  return (
    <Card className="border-card-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium">Mapping Preview</CardTitle>
          <span className="text-xs text-muted-foreground">
            First {previewRows.length} row{previewRows.length !== 1 ? "s" : ""}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasAnyMapping ? (
          <div className="flex items-center gap-2 p-4 rounded-lg bg-muted/40 border border-dashed border-border">
            <AlertCircle className="w-4 h-4 text-muted-foreground shrink-0" />
            <p className="text-sm text-muted-foreground">
              Complete the mappings above to see a preview of how your data will
              be imported.
            </p>
          </div>
        ) : previewRows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No rows available to preview.
          </p>
        ) : (
          <div className="space-y-3">
            {previewRows.map((row, idx) => (
              <PairCard
                key={idx}
                pair={resolvePair(row, mappings)}
                index={idx}
              />
            ))}
          </div>
        )}

        {rows.length > 3 && hasAnyMapping && (
          <>
            <Separator />
            <p className="text-xs text-muted-foreground text-center">
              Preview shows 3 of {rows.length} rows.{" "}
              All rows will be imported when you confirm.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
