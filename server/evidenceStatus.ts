import { and, eq, sql } from "drizzle-orm";
import { db } from "./db";
import { pairs, votes } from "@shared/schema";
import type { CampaignConfig, EvidenceStatus } from "@shared/campaignConfig";

/**
 * Evidence-status computation engine.
 *
 * `computeEvidenceStatus` is a pure function of (campaign config, active votes)
 * — the heart of the evidence-tier model and the most heavily unit-tested piece.
 * The persistence wrappers below lock the pair row and write the result inside a
 * transaction so concurrent votes can't corrupt status.
 */

/** Minimal vote shape the scorer needs (structurally matches a Vote row). */
export interface VoteForScoring {
  scoreBinary: "match" | "no_match" | "unsure" | null;
  scoreNumeric: number | null;
}

/**
 * Observability for the total-function safety net. `fallbacks` increments every
 * time computeEvidenceStatus swallows an internal error and returns the
 * `in_review` sentinel — so a config/logic bug surfaces as a metric instead of a
 * silently-wrong status. Tests assert this increments.
 */
export const evidenceStatusMetrics = { fallbacks: 0 };

/**
 * Compute a pair's evidence status from its active votes and the campaign config.
 *
 * Total (never throws): on any internal error it logs, bumps the fallback metric,
 * and returns the `in_review` sentinel. This matters because the vote insert and
 * status update share one transaction — a throw here would roll back a legitimate
 * vote. Config is Zod-validated on every write, so the fallback should only ever
 * fire on a genuine bug, which is why it must be observable rather than silent.
 */
export function computeEvidenceStatus(
  config: CampaignConfig,
  activeVotes: VoteForScoring[],
): EvidenceStatus {
  try {
    const total = activeVotes.length;
    if (total === 0) return "unreviewed";

    const minVotes = config.consensus.minVotes ?? 2;
    if (total < minVotes) return "in_review";

    if (config.scoring.mode === "binary") {
      // Unsure votes are in the denominator but contribute to neither numerator.
      const matches = activeVotes.filter((v) => v.scoreBinary === "match").length;
      const noMatches = activeVotes.filter((v) => v.scoreBinary === "no_match").length;
      const matchPct = (matches / total) * 100;
      const noMatchPct = (noMatches / total) * 100;
      if (matchPct >= config.consensus.confirmPct) return "expert_confirmed";
      if (noMatchPct >= config.consensus.rejectPct) return "expert_rejected";
      return "disputed";
    }

    // numeric
    const { numericConfirmThreshold, numericRejectThreshold } = config.consensus;
    if (numericConfirmThreshold == null || numericRejectThreshold == null) {
      throw new Error(
        "numeric scoring requires numericConfirmThreshold and numericRejectThreshold",
      );
    }
    const scores = activeVotes
      .map((v) => v.scoreNumeric)
      // Exclude NaN explicitly: it passes `!= null` but poisons the mean (all
      // NaN comparisons are false), which would silently return "disputed"
      // instead of routing through the observable fallback below.
      .filter((n): n is number => n != null && !Number.isNaN(n));
    if (scores.length === 0) {
      throw new Error("numeric scoring computed over zero numeric scores");
    }
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    if (mean >= numericConfirmThreshold) return "expert_confirmed";
    if (mean <= numericRejectThreshold) return "expert_rejected";
    return "disputed";
  } catch (err) {
    evidenceStatusMetrics.fallbacks += 1;
    // Observable, non-silent fallback. Never throw — see the doc comment above.
    console.error(
      "[evidenceStatus] compute fallback -> in_review (config/logic error):",
      err,
    );
    return "in_review";
  }
}

/** Drizzle transaction handle type (avoids naming the long generic). */
type Tx = Parameters<Parameters<typeof db["transaction"]>[0]>[0];

/**
 * Recompute + persist a pair's evidence status INSIDE an existing transaction.
 * Locks the pair row (FOR UPDATE) so concurrent votes serialize, recomputes from
 * the current active votes, and writes the result. The caller owns the
 * transaction — a vote insert/supersession and this call form one atomic unit.
 */
export async function recomputeEvidenceStatusTx(
  tx: Tx,
  pairId: string,
  config: CampaignConfig,
): Promise<EvidenceStatus> {
  // Lock the pair row for the duration of the transaction.
  await tx.execute(sql`SELECT 1 FROM ${pairs} WHERE ${pairs.id} = ${pairId} FOR UPDATE`);

  const active = await tx
    .select({ scoreBinary: votes.scoreBinary, scoreNumeric: votes.scoreNumeric })
    .from(votes)
    .where(and(eq(votes.pairId, pairId), eq(votes.isActive, true)));

  const status = computeEvidenceStatus(config, active);
  await tx.update(pairs).set({ evidenceStatus: status }).where(eq(pairs.id, pairId));
  return status;
}

const SERIALIZATION_FAILURE = "40001";
const DEADLOCK_DETECTED = "40P01";
const LOCK_NOT_AVAILABLE = "55P03"; // raised by SET LOCAL lock_timeout on contention
const RETRYABLE_CODES = new Set([
  SERIALIZATION_FAILURE,
  DEADLOCK_DETECTED,
  LOCK_NOT_AVAILABLE,
]);

/**
 * Standalone recompute (its own transaction). Used by the bulk recompute path
 * (admin config edit). Sets a bounded lock_timeout and retries a few times on
 * serialization/deadlock so contention can't hang the request indefinitely.
 */
export async function recomputeAndPersistEvidenceStatus(
  pairId: string,
  config: CampaignConfig,
  maxRetries = 3,
): Promise<EvidenceStatus> {
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
        return recomputeEvidenceStatusTx(tx, pairId, config);
      });
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code != null && RETRYABLE_CODES.has(code) && attempt < maxRetries) {
        attempt += 1;
        continue;
      }
      throw err;
    }
  }
}

/** Active (non-superseded) votes for a pair. */
export async function getActiveVotesForPair(pairId: string) {
  return db
    .select()
    .from(votes)
    .where(and(eq(votes.pairId, pairId), eq(votes.isActive, true)));
}
