# Pair Selection Logic

How the expert-in-the-loop system determines which question/pair to display to reviewers.

## Overview

The system uses a **collaborative review model** where all reviewers independently evaluate all pairs. There is no pair assignment—each user sees pairs based on:
1. What they haven't yet reviewed or skipped
2. A priority algorithm favoring pairs needing more human evaluation

## Per-User Selection Algorithm

When a user requests the next pair (`GET /api/campaigns/:id/next-pair`), the system:

### Step 1: Build Exclusion Set
Queries the user's history to exclude:
- All pairs they've already voted on (`votes` table)
- All pairs they've skipped (`skipped_pairs` table)

### Step 2: Apply Priority Ranking
Remaining pairs are ranked by priority:

| Priority | Criteria | Rationale |
|----------|----------|-----------|
| 0 (highest) | Unevaluated pairs (0 votes from anyone) | Ensure all pairs get reviewed |
| 1 | Low-confidence pairs (LLM < 0.7) with < 3 votes | Human validation where AI is uncertain |
| 2 | Disputed pairs (40-60% match rate) | Resolve disagreement with more opinions |
| 3 | Everything else | Already have consensus |

### Step 3: Random Tiebreaker
Within the same priority tier, pairs are selected randomly via `RANDOM()`.

## Cross-User Behavior

**There is no cross-user coordination.**

- Different users can vote on the same pair simultaneously
- No locks, reservations, or assignment mechanisms
- All users of a campaign eventually see all pairs (in different orders)
- PostgreSQL unique constraint on `(pairId, userId)` ensures one vote per user per pair

This enables computing inter-rater reliability (Krippendorff's Alpha) from independent evaluations.

## State Tracking

| State | Table | Constraint |
|-------|-------|------------|
| Voted | `votes` | Unique on `(pairId, userId)` |
| Skipped | `skipped_pairs` | Unique on `(pairId, userId)` |

## Data Flow

```
┌─────────────────┐
│  ReviewPage     │  React component requests next pair
│  (client)       │
└────────┬────────┘
         │ GET /api/campaigns/:id/next-pair
         ▼
┌─────────────────┐
│  routes.ts      │  Express endpoint extracts userId from session
│  (server)       │
└────────┬────────┘
         │ storage.getNextPairForUser(campaignId, userId)
         ▼
┌─────────────────┐
│  storage.ts     │  Builds exclusion set, applies priority query
│  (server)       │
└────────┬────────┘
         │ SQL query with LEFT JOIN, GROUP BY, ORDER BY CASE
         ▼
┌─────────────────┐
│  PostgreSQL     │  Returns single pair or null
│  (database)     │
└─────────────────┘
```

## Key Files

| File | Function | Lines |
|------|----------|-------|
| `server/storage.ts` | `getNextPairForUser()` | 317-373 |
| `server/routes.ts` | `/api/campaigns/:id/next-pair` | 328-348 |
| `shared/schema.ts` | `votes`, `skippedPairs` tables | 83-99, 127-134 |
| `client/src/pages/review.tsx` | Client-side fetch & render | 348-421 |
