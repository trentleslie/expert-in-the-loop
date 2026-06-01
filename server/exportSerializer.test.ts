import { describe, it, expect } from "vitest";
import { parse } from "csv-parse/sync";
import type { Pair, Vote } from "@shared/schema";
import {
  buildExportRows,
  serializeExport,
  isExportFormat,
  exportFilename,
  exportContentType,
  type ExportItem,
} from "./exportSerializer";

// --- fixtures --------------------------------------------------------------
const pair = (o: Partial<Pair> = {}): Pair =>
  ({
    id: "p1",
    campaignId: "c1",
    pairType: "metabolite",
    evidenceStatus: "unreviewed",
    resolutionLayer: "unspecified",
    sourceText: "Glucose",
    sourceDataset: "NMR",
    sourceId: "SRC1",
    sourceMetadata: null,
    targetText: "D-Glucose",
    targetDataset: "HMDB",
    targetId: "HMDB0000122",
    targetMetadata: null,
    llmConfidence: 0.9,
    llmModel: "gpt-4o",
    llmReasoning: null,
    createdAt: new Date(),
    ...o,
  }) as Pair;

const vote = (scoreBinary: Vote["scoreBinary"], o: Partial<Vote> = {}): Vote =>
  ({
    id: "v",
    pairId: "p1",
    userId: "u",
    scoreBinary,
    scoreNumeric: null,
    scoringMode: "binary",
    expertSelectedCode: null,
    reviewerNotes: null,
    supersededBy: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...o,
  }) as Vote;

const item = (o: Partial<ExportItem> & { pair: Pair }): ExportItem => ({
  votes: [],
  positiveRate: null,
  totalVoteCount: 0,
  ...o,
});

const meta = { campaignName: "test4", exportedAt: "2026-06-01T00:00:00.000Z" };

const CANONICAL_FIELDS = [
  "pair_id", "source_text", "source_dataset", "source_id",
  "target_text", "target_dataset", "target_id",
  "evidence_status", "resolution_layer", "llm_confidence", "llm_model",
  "active_vote_count", "total_vote_count",
  "positive_votes", "negative_votes", "unsure_votes",
  "positive_rate", "mean_score", "expert_selections", "reviewer_notes",
];

describe("buildExportRows", () => {
  it("carries the full canonical field set incl. evidence_status/resolution_layer/unsure_votes", () => {
    const rows = buildExportRows([
      item({
        pair: pair({ evidenceStatus: "expert_confirmed", resolutionLayer: "ai_assisted" }),
        votes: [vote("match")],
        positiveRate: 1,
        totalVoteCount: 1,
      }),
    ]);
    expect(Object.keys(rows[0])).toEqual(CANONICAL_FIELDS);
    expect(rows[0].evidence_status).toBe("expert_confirmed");
    expect(rows[0].resolution_layer).toBe("ai_assisted");
    expect(rows[0].positive_votes).toBe(1);
    expect(rows[0].positive_rate).toBe("1.000");
  });

  it("numeric campaign: binary counts 0, positive_rate N/A (not 0.000), mean_score set", () => {
    const rows = buildExportRows([
      item({
        pair: pair({ evidenceStatus: "expert_confirmed" }),
        votes: [
          vote(null, { scoreNumeric: 4, scoringMode: "numeric" }),
          vote(null, { scoreNumeric: 2, scoringMode: "numeric" }),
        ],
        positiveRate: 0, // storage would report 0/N here — must NOT surface as "0.000"
        totalVoteCount: 2,
      }),
    ]);
    expect(rows[0]).toMatchObject({
      active_vote_count: 2,
      positive_votes: 0,
      negative_votes: 0,
      unsure_votes: 0,
      positive_rate: "",
      mean_score: "3.000",
    });
  });

  it("counts an unsure-only pair as 0/0/1 (the table-vs-export consistency case)", () => {
    const rows = buildExportRows([
      item({ pair: pair({ evidenceStatus: "disputed" }), votes: [vote("unsure")], totalVoteCount: 1 }),
    ]);
    expect(rows[0]).toMatchObject({
      positive_votes: 0,
      negative_votes: 0,
      unsure_votes: 1,
      evidence_status: "disputed",
    });
  });
});

describe("serializeExport — JSON", () => {
  it("keeps the envelope and exposes the same fields as CSV", () => {
    const rows = buildExportRows([item({ pair: pair() })]);
    const out = JSON.parse(serializeExport(rows, "json", meta));
    expect(out).toMatchObject({ campaign: "test4", exportedAt: meta.exportedAt, total: 1 });
    expect(Object.keys(out.pairs[0])).toEqual(CANONICAL_FIELDS);
  });

  it("does not mutate values (HTML-encoding is the consumer's job)", () => {
    const rows = buildExportRows([
      item({ pair: pair({ llmReasoning: null }), votes: [vote("match", { reviewerNotes: "<script>x</script>" })] }),
    ]);
    const out = JSON.parse(serializeExport(rows, "json", meta));
    expect(out.pairs[0].reviewer_notes).toBe("<script>x</script>");
  });
});

describe("serializeExport — CSV/TSV", () => {
  it("neutralizes formula injection (=,+,-,@) in CSV and TSV", () => {
    const rows = buildExportRows([
      item({ pair: pair(), votes: [vote("match", { reviewerNotes: "=1+1" })] }),
    ]);
    expect(serializeExport(rows, "csv", meta)).toContain("'=1+1");
    expect(serializeExport(rows, "tsv", meta)).toContain("'=1+1");
  });

  it("uses a tab delimiter for TSV", () => {
    const rows = buildExportRows([item({ pair: pair() })]);
    const header = serializeExport(rows, "tsv", meta).split(/\r?\n/)[0];
    expect(header).toContain("\t");
    expect(header).not.toContain(",");
  });

  it("keeps embedded newlines/tabs inside a quoted cell (no TSV row break)", () => {
    const rows = buildExportRows([
      item({ pair: pair(), votes: [vote("match", { reviewerNotes: "line1\nline2\twith tab" })] }),
    ]);
    const tsv = serializeExport(rows, "tsv", meta);
    // Round-trip through a real parser: still exactly one data row, value intact.
    const parsed = parse(tsv, { delimiter: "\t", columns: true, relax_quotes: true });
    expect(parsed).toHaveLength(1);
    expect(parsed[0].reviewer_notes).toBe("line1\nline2\twith tab");
  });
});

describe("format allowlist + helpers", () => {
  it("isExportFormat accepts only csv/tsv/json", () => {
    expect(isExportFormat("csv")).toBe(true);
    expect(isExportFormat("tsv")).toBe(true);
    expect(isExportFormat("json")).toBe(true);
    expect(isExportFormat("xml")).toBe(false);
    expect(isExportFormat(undefined)).toBe(false);
    expect(isExportFormat(["csv", "tsv"])).toBe(false);
  });

  it("sanitizes Content-Disposition filenames", () => {
    expect(exportFilename('te"st;4\r\n', "csv")).toBe("te_st_4_export.csv");
    expect(exportFilename("Q4 Review", "tsv")).toBe("Q4_Review_export.tsv");
    expect(exportFilename("", "json")).toBe("campaign_export.json");
  });

  it("maps content types", () => {
    expect(exportContentType("csv")).toBe("text/csv");
    expect(exportContentType("tsv")).toBe("text/tab-separated-values");
    expect(exportContentType("json")).toBe("application/json");
  });
});
