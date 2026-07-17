/**
 * Additive importer for benchmark-derived EITL campaigns.
 *
 * Creates ONE campaign and its review pairs through the application's own storage
 * layer (`storage.createCampaign` + `storage.createPairs`, both `db.insert`-only).
 * It NEVER updates or deletes any row — the only failure mode is an extra campaign
 * a human can remove in the admin UI. Dry-run by default; the database is touched
 * only under `--commit`.
 *
 * Usage:
 *   tsx scripts/import-benchmark-campaign.ts <campaign.json>                          # dry-run (no DB)
 *   tsx scripts/import-benchmark-campaign.ts <campaign.json> --commit --created-by <userId>
 *
 * <campaign.json> shape:
 *   { "campaign": { "name", "campaignType", "description"?, "instructions"? },
 *     "pairs": [ { "pairType", "sourceText", "sourceId", "sourceDataset",
 *                  "targetText", "targetId", "targetDataset", "targetMetadata"? }, ... ] }
 */
import { readFileSync } from "node:fs";
import { insertCampaignSchema, insertPairSchema } from "@shared/schema";

const PLACEHOLDER_CAMPAIGN_ID = "00000000-0000-0000-0000-000000000000";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const file = argv.find((a) => !a.startsWith("--"));
  const commit = argv.includes("--commit");
  const createdByIdx = argv.indexOf("--created-by");
  const createdBy = createdByIdx >= 0 ? argv[createdByIdx + 1] : undefined;

  if (!file) {
    console.error("usage: tsx scripts/import-benchmark-campaign.ts <campaign.json> [--commit --created-by <userId>]");
    process.exit(2);
  }

  const spec = JSON.parse(readFileSync(file, "utf8")) as {
    campaign: { name: string; campaignType: string; description?: string; instructions?: string };
    pairs: Array<Record<string, unknown>>;
  };
  const { campaign, pairs } = spec;

  if (!campaign?.name || !campaign?.campaignType) {
    console.error("campaign.name and campaign.campaignType are required");
    process.exit(2);
  }
  console.log(`Campaign: "${campaign.name}" [${campaign.campaignType}] — ${pairs.length} pairs`);

  // Validate every pair against the app's own insert schema BEFORE any DB contact,
  // filling a placeholder campaignId (the real id is bound at insert time).
  let invalid = 0;
  for (const [i, p] of pairs.entries()) {
    const res = insertPairSchema.safeParse({ ...p, campaignId: PLACEHOLDER_CAMPAIGN_ID });
    if (!res.success) {
      invalid++;
      if (invalid <= 3) {
        console.error(`  pair[${i}] invalid: ${res.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; ")}`);
      }
    }
  }
  if (invalid) {
    console.error(`${invalid}/${pairs.length} pairs failed insertPairSchema — aborting, nothing written.`);
    process.exit(1);
  }
  console.log(`All ${pairs.length} pairs pass insertPairSchema.`);

  if (!commit) {
    console.log("\nDRY RUN — no database connection opened, nothing written.");
    console.log("Re-run with `--commit --created-by <userId>` to insert.");
    console.log("Sample pair:\n" + JSON.stringify(pairs[0], null, 2));
    return;
  }

  if (!createdBy) {
    console.error("--commit requires --created-by <userId> (an existing users.id)");
    process.exit(2);
  }

  // Lazy import so a dry-run never loads server/db.ts (which throws without DATABASE_URL).
  const { storage } = await import("../server/storage");

  const campaignInsert = insertCampaignSchema.parse({
    name: campaign.name,
    campaignType: campaign.campaignType,
    description: campaign.description ?? null,
    instructions: campaign.instructions ?? null,
    createdBy,
    config: null, // null -> getCampaignConfig() falls back to DEFAULT_CAMPAIGN_CONFIG; tune in the UI
    status: "draft", // created inactive; an admin activates it after review
  });
  const created = await storage.createCampaign(campaignInsert);
  console.log(`Created campaign ${created.id} (status=${created.status}).`);

  const pairInserts = pairs.map((p) => insertPairSchema.parse({ ...p, campaignId: created.id }));
  const inserted = await storage.createPairs(pairInserts);
  console.log(`Inserted ${inserted} pairs into campaign ${created.id}.`);
  console.log("Done — additive only (createCampaign + createPairs); no updates or deletes performed.");
}

main().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
