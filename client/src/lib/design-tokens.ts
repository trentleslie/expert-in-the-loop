/**
 * Design System Tokens
 *
 * Centralized color and style definitions for consistent UI across the app.
 * All status indicators, confidence displays, and vote-related colors should
 * reference these tokens rather than hardcoding Tailwind classes.
 */

// Campaign and entity status colors
export const STATUS_COLORS = {
  active: {
    bg: 'bg-green-500/10',
    text: 'text-green-600 dark:text-green-400',
    border: 'border-green-500/20',
    dot: 'bg-green-500',
  },
  draft: {
    bg: 'bg-yellow-500/10',
    text: 'text-yellow-600 dark:text-yellow-400',
    border: 'border-yellow-500/20',
    dot: 'bg-yellow-500',
  },
  completed: {
    bg: 'bg-blue-500/10',
    text: 'text-blue-600 dark:text-blue-400',
    border: 'border-blue-500/20',
    dot: 'bg-blue-500',
  },
  archived: {
    bg: 'bg-gray-500/10',
    text: 'text-gray-600 dark:text-gray-400',
    border: 'border-gray-500/20',
    dot: 'bg-gray-500',
  },
} as const;

// LLM confidence indicator colors
export const CONFIDENCE_COLORS = {
  high: {
    bg: 'bg-green-500 dark:bg-green-400',
    text: 'text-green-600 dark:text-green-400',
  },
  medium: {
    bg: 'bg-yellow-500 dark:bg-yellow-400',
    text: 'text-yellow-600 dark:text-yellow-400',
  },
  low: {
    bg: 'bg-red-500 dark:bg-red-400',
    text: 'text-red-600 dark:text-red-400',
  },
} as const;

// Vote result badge colors
export const VOTE_COLORS = {
  match: {
    bg: 'bg-green-500/10',
    text: 'text-green-600 dark:text-green-400',
    border: 'border-green-500/20',
  },
  noMatch: {
    bg: 'bg-red-500/10',
    text: 'text-red-600 dark:text-red-400',
    border: 'border-red-500/20',
  },
  unsure: {
    bg: 'bg-yellow-500/10',
    text: 'text-yellow-600 dark:text-yellow-400',
    border: 'border-yellow-500/20',
  },
  skip: {
    bg: 'bg-gray-500/10',
    text: 'text-gray-600 dark:text-gray-400',
    border: 'border-gray-500/20',
  },
} as const;

// Numeric score colors (1=red → 3=yellow → 5=green)
export const SCORE_COLORS = {
  1: {
    bg: 'bg-red-500/10',
    text: 'text-red-600 dark:text-red-400',
    border: 'border-red-500/20',
  },
  2: {
    bg: 'bg-orange-500/10',
    text: 'text-orange-600 dark:text-orange-400',
    border: 'border-orange-500/20',
  },
  3: {
    bg: 'bg-yellow-500/10',
    text: 'text-yellow-600 dark:text-yellow-400',
    border: 'border-yellow-500/20',
  },
  4: {
    bg: 'bg-lime-500/10',
    text: 'text-lime-600 dark:text-lime-400',
    border: 'border-lime-500/20',
  },
  5: {
    bg: 'bg-green-500/10',
    text: 'text-green-600 dark:text-green-400',
    border: 'border-green-500/20',
  },
} as const;

// Helper functions
export function getStatusColors(status: keyof typeof STATUS_COLORS) {
  return STATUS_COLORS[status] || STATUS_COLORS.archived;
}

export function getConfidenceLevel(confidence: number): keyof typeof CONFIDENCE_COLORS {
  if (confidence >= 0.8) return 'high';
  if (confidence >= 0.5) return 'medium';
  return 'low';
}

export function getConfidenceColors(confidence: number) {
  return CONFIDENCE_COLORS[getConfidenceLevel(confidence)];
}

export function getVoteColors(vote: 'match' | 'no_match' | 'unsure' | 'skip') {
  if (vote === 'no_match') return VOTE_COLORS.noMatch;
  return VOTE_COLORS[vote] || VOTE_COLORS.skip;
}

export function getScoreColors(score: number) {
  const clampedScore = Math.max(1, Math.min(5, Math.round(score))) as 1 | 2 | 3 | 4 | 5;
  return SCORE_COLORS[clampedScore];
}

// Type exports
export type StatusType = keyof typeof STATUS_COLORS;
export type ConfidenceLevel = keyof typeof CONFIDENCE_COLORS;
export type VoteType = 'match' | 'noMatch' | 'unsure' | 'skip';
export type ScoreType = 1 | 2 | 3 | 4 | 5;
