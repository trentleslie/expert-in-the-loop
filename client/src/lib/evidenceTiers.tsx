import {
  Clock,
  Eye,
  CheckCircle,
  XCircle,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  EVIDENCE_STATUS_VALUES,
  type EvidenceStatus,
} from "@shared/campaignConfig";

/**
 * Single source of truth for evidence-tier presentation across results,
 * analytics, and home progress. Every tier is encoded with BOTH a color and an
 * icon — color is never the sole signal (accessibility).
 *
 *  - label:      human-readable tier name
 *  - icon:       lucide icon paired with the tier
 *  - badgeClass: Tailwind classes for a badge (bg/text/border)
 *  - barColor:   hex color for chart segments / segmented progress bars
 */
export const EVIDENCE_TIER_META: Record<
  EvidenceStatus,
  { label: string; icon: LucideIcon; badgeClass: string; barColor: string }
> = {
  unreviewed: {
    label: "Unreviewed",
    icon: Clock,
    badgeClass:
      "bg-muted text-muted-foreground border-border",
    barColor: "#9ca3af", // grey-400
  },
  in_review: {
    label: "In Review",
    icon: Eye,
    badgeClass:
      "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
    barColor: "#3b82f6", // blue-500
  },
  expert_confirmed: {
    label: "Confirmed",
    icon: CheckCircle,
    badgeClass:
      "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20",
    barColor: "#22c55e", // green-500
  },
  expert_rejected: {
    label: "Rejected",
    icon: XCircle,
    badgeClass:
      "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
    barColor: "#ef4444", // red-500
  },
  disputed: {
    label: "Disputed",
    icon: AlertTriangle,
    badgeClass:
      "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    barColor: "#f59e0b", // amber-500
  },
};

/** Ordered list of tiers (matches the shared contract order). */
export const EVIDENCE_TIER_ORDER: EvidenceStatus[] = [...EVIDENCE_STATUS_VALUES];

/** Coerce an arbitrary string (e.g. a DB text column) into a known tier. */
export function asEvidenceStatus(value: string | null | undefined): EvidenceStatus {
  if (value && (EVIDENCE_STATUS_VALUES as readonly string[]).includes(value)) {
    return value as EvidenceStatus;
  }
  return "unreviewed";
}

/**
 * Badge rendering a pair's stored evidence status with icon + label + color.
 * Reads the stored tier directly — no client-side consensus recomputation.
 */
export function EvidenceStatusBadge({
  status,
  className,
}: {
  status: string | null | undefined;
  className?: string;
}) {
  const tier = asEvidenceStatus(status);
  const meta = EVIDENCE_TIER_META[tier];
  const Icon = meta.icon;
  return (
    <Badge
      variant="outline"
      className={`gap-1 ${meta.badgeClass} ${className ?? ""}`}
      data-testid={`badge-evidence-${tier}`}
    >
      <Icon className="w-3 h-3" />
      {meta.label}
    </Badge>
  );
}
