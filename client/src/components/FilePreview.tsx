import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, Rows3, Columns3 } from "lucide-react";
import type { ColumnMappings } from "@/components/ColumnMapper";

interface FilePreviewProps {
  file: File;
  rows: Record<string, string>[];
  delimiter: string;
  mappings?: ColumnMappings;
}

function getMappedColumns(mappings: ColumnMappings): Set<string> {
  const mapped = new Set<string>();

  const fieldKeys: (keyof ColumnMappings)[] = [
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
    const field = mappings[key] as
      | { type: "column" | "manual" | "none"; value: string }
      | undefined;
    if (field && field.type === "column" && field.value) {
      mapped.add(field.value);
    }
  }

  for (const col of mappings.sourceMetadataColumns) {
    mapped.add(col);
  }
  for (const col of mappings.targetMetadataColumns) {
    mapped.add(col);
  }

  return mapped;
}

function formatDelimiter(delimiter: string): string {
  switch (delimiter) {
    case ",":
      return "Comma (,)";
    case "\t":
      return "Tab (\\t)";
    case ";":
      return "Semicolon (;)";
    case "|":
      return "Pipe (|)";
    default:
      return `Custom (${delimiter})`;
  }
}

export function FilePreview({ file, rows, delimiter, mappings }: FilePreviewProps) {
  const previewRows = rows.slice(0, 5);
  const columns = useMemo(
    () => (previewRows.length > 0 ? Object.keys(previewRows[0]) : []),
    [previewRows]
  );

  const mappedColumns = useMemo(
    () => (mappings ? getMappedColumns(mappings) : new Set<string>()),
    [mappings]
  );

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Card className="border-card-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium">File Preview</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* File info strip */}
        <div className="flex flex-wrap items-center gap-3 p-3 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-2 text-sm">
            <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="font-medium text-foreground truncate max-w-[240px]">
              {file.name}
            </span>
            <span className="text-muted-foreground">
              ({formatFileSize(file.size)})
            </span>
          </div>
          <div className="flex items-center gap-2 ml-auto flex-wrap gap-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Rows3 className="w-3.5 h-3.5" />
              <span>{rows.length} rows</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Columns3 className="w-3.5 h-3.5" />
              <span>{columns.length} columns</span>
            </div>
            <Badge variant="secondary" className="text-xs font-mono">
              {formatDelimiter(delimiter)}
            </Badge>
          </div>
        </div>

        {/* Preview table */}
        {previewRows.length > 0 ? (
          <ScrollArea className="w-full rounded-md border border-border">
            <div className="min-w-full">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    {columns.map((col) => {
                      const isMapped = mappedColumns.has(col);
                      return (
                        <th
                          key={col}
                          className={`px-3 py-2 text-left font-medium whitespace-nowrap ${
                            isMapped
                              ? "text-primary"
                              : "text-muted-foreground"
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            {isMapped && (
                              <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                            )}
                            <span className="font-mono">{col}</span>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, rowIdx) => (
                    <tr
                      key={rowIdx}
                      className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors"
                    >
                      {columns.map((col) => (
                        <td
                          key={col}
                          className={`px-3 py-2 max-w-[200px] truncate ${
                            mappedColumns.has(col)
                              ? "text-foreground"
                              : "text-muted-foreground"
                          }`}
                          title={row[col]}
                        >
                          {row[col] ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ScrollArea>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">
            No data rows found in file.
          </p>
        )}

        {rows.length > 5 && (
          <p className="text-xs text-muted-foreground text-right">
            Showing 5 of {rows.length} rows
            {mappings && mappedColumns.size > 0 && (
              <span className="ml-2">
                &mdash;{" "}
                <span className="text-primary font-medium">
                  {mappedColumns.size} column{mappedColumns.size !== 1 ? "s" : ""} mapped
                </span>
              </span>
            )}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
