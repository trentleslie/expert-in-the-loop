import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Play,
  Download,
  ChevronDown,
  Database,
  Table as TableIcon,
  AlertCircle,
  Clock,
} from "lucide-react";

type QueryResult = {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  executionTime: number;
};

const QUICK_QUERIES = [
  {
    name: "Campaign Summary",
    description: "Overview of campaigns with vote counts",
    sql: `SELECT 
  c.name,
  c.status,
  COUNT(DISTINCT p.id) as total_pairs,
  COUNT(DISTINCT v.id) as total_votes,
  COUNT(DISTINCT v.user_id) as unique_reviewers
FROM campaigns c
LEFT JOIN pairs p ON c.id = p.campaign_id
LEFT JOIN votes v ON p.id = v.pair_id
GROUP BY c.id
ORDER BY c.created_at DESC;`,
  },
  {
    name: "Vote Distribution",
    description: "Distribution of votes by scoring mode",
    sql: `SELECT 
  scoring_mode,
  COUNT(*) as vote_count,
  COUNT(CASE WHEN score_binary = 'match' THEN 1 END) as positive,
  COUNT(CASE WHEN score_binary = 'no_match' THEN 1 END) as negative,
  COUNT(CASE WHEN score_binary = 'unsure' THEN 1 END) as unsure,
  AVG(score_numeric) as avg_numeric_score
FROM votes
GROUP BY scoring_mode;`,
  },
  {
    name: "Reviewer Stats",
    description: "Vote counts per reviewer",
    sql: `SELECT 
  u.email,
  u.display_name,
  COUNT(v.id) as total_votes,
  COUNT(CASE WHEN v.score_binary = 'match' THEN 1 END) as positive_votes,
  COUNT(CASE WHEN v.score_binary = 'no_match' THEN 1 END) as negative_votes,
  COUNT(CASE WHEN v.score_binary = 'unsure' THEN 1 END) as unsure_votes
FROM users u
LEFT JOIN votes v ON u.id = v.user_id
GROUP BY u.id
ORDER BY total_votes DESC;`,
  },
  {
    name: "High Disagreement Pairs",
    description: "Pairs with 40-60% positive rate (3+ votes, excluding unsure)",
    sql: `SELECT 
  p.source_text,
  p.target_text,
  COUNT(v.id) as vote_count,
  AVG(CASE WHEN v.score_binary = 'match' THEN 1.0 WHEN v.score_binary = 'no_match' THEN 0.0 END) as positive_rate
FROM pairs p
INNER JOIN votes v ON p.id = v.pair_id
WHERE v.score_binary IN ('match', 'no_match')
GROUP BY p.id
HAVING COUNT(v.id) >= 3 
  AND AVG(CASE WHEN v.score_binary = 'match' THEN 1.0 ELSE 0.0 END) BETWEEN 0.4 AND 0.6
ORDER BY vote_count DESC
LIMIT 50;`,
  },
  {
    name: "Skip Analysis",
    description: "Pairs with high skip rates",
    sql: `SELECT 
  p.source_text,
  p.target_id,
  p.llm_confidence,
  COUNT(s.id) as skip_count
FROM pairs p
INNER JOIN skipped_pairs s ON p.id = s.pair_id
GROUP BY p.id
ORDER BY skip_count DESC
LIMIT 50;`,
  },
  {
    name: "Expert Selections",
    description: "Alternative codes suggested by reviewers",
    sql: `SELECT 
  v.expert_selected_code,
  COUNT(*) as selection_count,
  p.target_id as original_target
FROM votes v
INNER JOIN pairs p ON v.pair_id = p.id
WHERE v.expert_selected_code IS NOT NULL
GROUP BY v.expert_selected_code, p.target_id
ORDER BY selection_count DESC
LIMIT 50;`,
  },
];

const SCHEMA_INFO = [
  { table: "users", columns: ["id", "email", "display_name", "role", "created_at", "last_active"] },
  { table: "campaigns", columns: ["id", "name", "description", "campaign_type", "created_by", "status", "created_at"] },
  { table: "pairs", columns: ["id", "campaign_id", "pair_type", "source_text", "source_dataset", "source_id", "source_metadata", "target_text", "target_dataset", "target_id", "target_metadata", "llm_confidence", "llm_model", "llm_reasoning", "created_at"] },
  { table: "votes", columns: ["id", "pair_id", "user_id", "score_binary", "score_numeric", "scoring_mode", "expert_selected_code", "reviewer_notes", "created_at", "updated_at"] },
  { table: "skipped_pairs", columns: ["id", "pair_id", "user_id", "created_at"] },
  { table: "allowed_domains", columns: ["domain", "added_at", "added_by"] },
];

export default function DatabaseExplorerPage() {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [schemaOpen, setSchemaOpen] = useState(false);

  const executeMutation = useMutation({
    mutationFn: async (sql: string) => {
      const response = await apiRequest("POST", "/api/database/query", { sql });
      return response.json() as Promise<QueryResult>;
    },
    onSuccess: (data) => {
      setResult(data);
    },
    onError: (error: Error) => {
      toast({
        title: "Query Error",
        description: error.message || "Failed to execute query",
        variant: "destructive",
      });
    },
  });

  const handleQuickQuery = (sql: string) => {
    setQuery(sql);
    executeMutation.mutate(sql);
  };

  const handleExportCSV = () => {
    if (!result || result.rows.length === 0) return;

    const headers = result.columns.join(",");
    const rows = result.rows.map((row) =>
      result.columns
        .map((col) => {
          const val = row[col];
          if (val === null) return "";
          const str = String(val);
          return str.includes(",") || str.includes('"') || str.includes("\n")
            ? `"${str.replace(/"/g, '""')}"`
            : str;
        })
        .join(",")
    );
    const csv = [headers, ...rows].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "query_results.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              Database Explorer
            </h1>
            <p className="text-sm text-muted-foreground">
              Execute read-only SQL queries
            </p>
          </div>
          <Badge variant="outline" className="gap-1">
            <Database className="w-3 h-3" />
            Read-Only
          </Badge>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1 space-y-4">
            <Card className="border-card-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Quick Queries</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {QUICK_QUERIES.map((q) => (
                  <Button
                    key={q.name}
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-left h-auto py-2"
                    onClick={() => handleQuickQuery(q.sql)}
                    data-testid={`button-quick-query-${q.name.toLowerCase().replace(/\s/g, "-")}`}
                  >
                    <div className="min-w-0 overflow-hidden">
                      <p className="text-sm font-medium break-words">{q.name}</p>
                      <p className="text-xs text-muted-foreground break-words whitespace-normal">{q.description}</p>
                    </div>
                  </Button>
                ))}
              </CardContent>
            </Card>

            <Collapsible open={schemaOpen} onOpenChange={setSchemaOpen}>
              <Card className="border-card-border">
                <CollapsibleTrigger asChild>
                  <CardHeader className="pb-2 cursor-pointer">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-medium">Schema</CardTitle>
                      <ChevronDown
                        className={`w-4 h-4 transition-transform ${schemaOpen ? "rotate-180" : ""}`}
                      />
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="space-y-3 pt-0">
                    {SCHEMA_INFO.map((table) => (
                      <div key={table.table}>
                        <div className="flex items-center gap-1.5 text-sm font-medium">
                          <TableIcon className="w-3 h-3" />
                          {table.table}
                        </div>
                        <div className="ml-4 text-xs text-muted-foreground">
                          {table.columns.join(", ")}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          </div>

          <div className="lg:col-span-3 space-y-4">
            <Card className="border-card-border">
              <CardContent className="p-4 space-y-4">
                <Textarea
                  placeholder="Enter your SQL query here...&#10;&#10;SELECT * FROM campaigns LIMIT 10;"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="font-mono text-sm min-h-32"
                  data-testid="textarea-query"
                />
                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => executeMutation.mutate(query)}
                    disabled={!query.trim() || executeMutation.isPending}
                    className="gap-2"
                    data-testid="button-run-query"
                  >
                    {executeMutation.isPending ? (
                      <Clock className="w-4 h-4 animate-spin" />
                    ) : (
                      <Play className="w-4 h-4" />
                    )}
                    Run Query
                  </Button>
                  {result && result.rows && result.rows.length > 0 && (
                    <Button
                      variant="outline"
                      onClick={handleExportCSV}
                      className="gap-2"
                      data-testid="button-export"
                    >
                      <Download className="w-4 h-4" />
                      Export CSV
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {executeMutation.isPending && (
              <Card className="border-card-border">
                <CardContent className="p-6">
                  <div className="space-y-4">
                    <Skeleton className="h-8" />
                    <Skeleton className="h-32" />
                  </div>
                </CardContent>
              </Card>
            )}

            {result && !executeMutation.isPending && (
              <Card className="border-card-border">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">
                      Results ({result.rowCount} rows)
                    </CardTitle>
                    <span className="text-xs text-muted-foreground">
                      {result.executionTime}ms
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="p-0 overflow-auto max-h-96">
                  {result.rows && result.rows.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {(result.columns || []).map((col) => (
                            <TableHead key={col} className="text-xs font-mono">
                              {col}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.rows.map((row, i) => (
                          <TableRow key={i}>
                            {result.columns.map((col) => (
                              <TableCell key={col} className="text-xs font-mono max-w-xs truncate">
                                {row[col] === null ? (
                                  <span className="text-muted-foreground">null</span>
                                ) : (
                                  String(row[col])
                                )}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="p-6 text-center text-muted-foreground">
                      Query executed successfully. No rows returned.
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {executeMutation.isError && (
              <Card className="border-card-border border-destructive/50">
                <CardContent className="p-4 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-destructive">Query Error</p>
                    <p className="text-sm text-muted-foreground">
                      {(executeMutation.error as Error)?.message || "An error occurred"}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
