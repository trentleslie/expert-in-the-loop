import { stringify } from "csv-stringify/sync";
import type { Pair, Vote } from "@shared/schema";

/**
 * Single source of truth for campaign export serialization.
 *
 * Every format (csv | tsv | json) is produced from the SAME canonical row set
 * (`buildExportRows`), so the formats can never drift apart in field coverage —
 * the bug that previously left JSON missing evidence_status/resolution_layer/
 * unsure_votes (the client used to hand-roll its own JSON shape).
 *
 * Scope: all formats export the WHOLE campaign (filters are on-screen only).
 * JSON keeps the historical envelope {campaign, exportedAt, total, pairs:[...]}.
 * HTML-encoding of values is the consumer's responsibility (export is data
 * interchange, not HTML) — values are emitted verbatim. CSV/TSV additionally
 * neutralize spreadsheet formula injection.
 */

export const EXPORT_FORMATS = ["csv", "tsv", "json"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export function isExportFormat(value: unknown): value is ExportFormat {
  return typeof value === "string" && (EXPORT_FORMATS as readonly string[]).includes(value);
}

/** Element shape returned by `storage.getCampaignExportData`. */
export type ExportItem = {
  pair: Pair;
  votes: Vote[];
  positiveRate: number | null;
  totalVoteCount: number;
};

/** The canonical, format-agnostic row. Field order is the CSV/TSV column order. */
export type ExportRow = {
  pair_id: string;
  source_text: string;
  source_dataset: string;
  source_id: string;
  target_text: string;
  target_dataset: string;
  target_id: string;
  evidence_status: string;
  resolution_layer: string;
  llm_confidence: number | null;
  llm_model: string | null;
  active_vote_count: number;
  total_vote_count: number;
  positive_votes: number;
  negative_votes: number;
  unsure_votes: number;
  positive_rate: string;
  expert_selections: string;
  reviewer_notes: string;
};

export function buildExportRows(exportData: ExportItem[]): ExportRow[] {
  return exportData.map((item) => ({
    pair_id: item.pair.id,
    source_text: item.pair.sourceText,
    source_dataset: item.pair.sourceDataset,
    source_id: item.pair.sourceId,
    target_text: item.pair.targetText,
    target_dataset: item.pair.targetDataset,
    target_id: item.pair.targetId,
    // Stored, engine-computed status + provenance — every format carries these.
    evidence_status: item.pair.evidenceStatus,
    resolution_layer: item.pair.resolutionLayer,
    llm_confidence: item.pair.llmConfidence,
    llm_model: item.pair.llmModel,
    active_vote_count: item.votes.length,
    total_vote_count: item.totalVoteCount,
    positive_votes: item.votes.filter((v) => v.scoreBinary === "match").length,
    negative_votes: item.votes.filter((v) => v.scoreBinary === "no_match").length,
    unsure_votes: item.votes.filter((v) => v.scoreBinary === "unsure").length,
    positive_rate: item.positiveRate !== null ? item.positiveRate.toFixed(3) : "",
    expert_selections: item.votes
      .filter((v) => v.expertSelectedCode)
      .map((v) => v.expertSelectedCode)
      .join("; "),
    reviewer_notes: item.votes
      .filter((v) => v.reviewerNotes)
      .map((v) => v.reviewerNotes)
      .join(" | "),
  }));
}

// Neutralize CSV/spreadsheet formula injection: any string cell starting with
// =, +, -, @, tab, or CR is prefixed with a single quote so BioMapper/RoP can't
// execute it on open. csv-stringify additionally quotes any cell containing the
// delimiter, a quote, or a newline — so embedded \n/\t can't break TSV rows.
const FORMULA_INJECTION = /^[=+\-@\t\r]/;
const neutralize = (value: string): string => (FORMULA_INJECTION.test(value) ? `'${value}` : value);

export type ExportMeta = { campaignName: string; exportedAt: string };

export function serializeExport(
  rows: ExportRow[],
  format: ExportFormat,
  meta: ExportMeta,
): string {
  if (format === "json") {
    // Preserve the historical envelope; values emitted verbatim (no mutation).
    return JSON.stringify(
      { campaign: meta.campaignName, exportedAt: meta.exportedAt, total: rows.length, pairs: rows },
      null,
      2,
    );
  }
  return stringify(rows, {
    header: true,
    delimiter: format === "tsv" ? "\t" : ",",
    cast: { string: (value) => neutralize(value) },
  });
}

export function exportContentType(format: ExportFormat): string {
  switch (format) {
    case "json":
      return "application/json";
    case "tsv":
      return "text/tab-separated-values";
    default:
      return "text/csv";
  }
}

/** Safe `Content-Disposition` filename segment from an arbitrary campaign name. */
export function exportFilename(campaignName: string, format: ExportFormat): string {
  const safe = (campaignName || "campaign").replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "campaign";
  return `${safe}_export.${format}`;
}
