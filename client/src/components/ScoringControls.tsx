import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ThumbsUp, ThumbsDown, HelpCircle, Loader2 } from "lucide-react";
import type { CampaignConfig } from "@shared/campaignConfig";

/**
 * Config-driven scoring controls for the review UI.
 *
 * Renders binary or numeric scoring controls based on `config.scoring.mode`.
 * All labels (binary positive/negative/neutral, numeric per-value) come from the
 * campaign config — nothing is hardcoded here. The mode switch is structured so a
 * future third scoring mode is additive (extend the union, add a branch).
 */

export type BinaryValue = "match" | "no_match" | "unsure";

type ScoringConfig = CampaignConfig["scoring"];

/** A member variable the reviewer partitions into a concept group (partition mode). */
export type PartitionMember = { id: string; text: string };

type ScoringControlsProps = {
  scoring: ScoringConfig;
  isSubmitting?: boolean;
} & (
  | {
      mode?: never;
      // Binary selection
      binaryValue?: BinaryValue | null;
      onBinarySelect: (value: BinaryValue) => void;
      // Numeric selection
      numericValue?: number | null;
      onNumericSelect: (value: number) => void;
      // Partition selection: the members to group + the submit callback (groups = a partition of ids).
      members?: PartitionMember[];
      onPartitionSelect: (groups: string[][]) => void;
    }
);

// Group labels A, B, C … (maxGroups <= 26, enforced by campaignConfig).
const GROUP_LABELS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

// Threshold at/below which numeric scales render as a button row rather than a
// slider. Larger ranges become unwieldy as buttons, so they get a slider.
const MAX_BUTTONS = 10;

function BinaryControls({
  labels,
  onSelect,
  isSubmitting,
}: {
  labels: { positive: string; negative: string; neutral: string };
  onSelect: (value: BinaryValue) => void;
  isSubmitting?: boolean;
}) {
  return (
    <div className="flex items-center justify-center gap-3 flex-wrap">
      <Button
        size="lg"
        variant="outline"
        className="h-14 px-6 gap-2"
        onClick={() => onSelect("no_match")}
        disabled={isSubmitting}
        data-testid="button-no-match"
      >
        {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <ThumbsDown className="w-5 h-5" />}
        {labels.negative}
      </Button>
      <Button
        size="lg"
        variant="secondary"
        className="h-14 px-6 gap-2"
        onClick={() => onSelect("unsure")}
        disabled={isSubmitting}
        data-testid="button-unsure"
      >
        {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <HelpCircle className="w-5 h-5" />}
        {labels.neutral}
      </Button>
      <Button
        size="lg"
        className="h-14 px-6 gap-2"
        onClick={() => onSelect("match")}
        disabled={isSubmitting}
        data-testid="button-yes-match"
      >
        {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <ThumbsUp className="w-5 h-5" />}
        {labels.positive}
      </Button>
    </div>
  );
}

function NumericControls({
  min,
  max,
  labels,
  value,
  onSelect,
  isSubmitting,
}: {
  min: number;
  max: number;
  labels?: Record<string, string>;
  value?: number | null;
  onSelect: (value: number) => void;
  isSubmitting?: boolean;
}) {
  const range: number[] = [];
  for (let i = min; i <= max; i++) range.push(i);
  const labelFor = (n: number) => labels?.[String(n)];

  if (range.length <= MAX_BUTTONS) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-center gap-2 flex-wrap">
          {range.map((score) => (
            <Button
              key={score}
              size="lg"
              variant={value === score ? "default" : "outline"}
              className="h-14 w-14 text-lg font-semibold"
              onClick={() => onSelect(score)}
              disabled={isSubmitting}
              data-testid={`button-score-${score}`}
            >
              {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : score}
            </Button>
          ))}
        </div>
        {labels && Object.keys(labels).length > 0 && (
          <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground flex-wrap">
            {range
              .filter((n) => labelFor(n))
              .map((n) => (
                <span key={n} data-testid={`label-score-${n}`}>
                  {n} = {labelFor(n)}
                </span>
              ))}
          </div>
        )}
      </div>
    );
  }

  // Large range: slider. Track the dragged value locally and only COMMIT the
  // vote on release (onValueCommit) — wiring onValueChange straight to onSelect
  // re-fired the confirmation dialog on every drag tick (finding #15). Reset to
  // the parent's value when it changes (e.g. after a vote resets the form).
  return <NumericSlider min={min} max={max} labelFor={labelFor} value={value} onSelect={onSelect} isSubmitting={isSubmitting} />;
}

function NumericSlider({
  min,
  max,
  labelFor,
  value,
  onSelect,
  isSubmitting,
}: {
  min: number;
  max: number;
  labelFor: (n: number) => string | undefined;
  value?: number | null;
  onSelect: (value: number) => void;
  isSubmitting?: boolean;
}) {
  const [pending, setPending] = useState<number>(value ?? min);
  useEffect(() => {
    setPending(value ?? min);
  }, [value, min]);

  return (
    <div className="space-y-4 max-w-xl mx-auto px-2">
      <div className="flex items-center justify-center gap-3">
        <span className="text-3xl font-semibold tabular-nums" data-testid="numeric-slider-value">
          {pending}
        </span>
        {labelFor(pending) && (
          <span className="text-sm text-muted-foreground" data-testid="numeric-slider-label">
            {labelFor(pending)}
          </span>
        )}
      </div>
      <Slider
        min={min}
        max={max}
        step={1}
        value={[pending]}
        onValueChange={(vals) => setPending(vals[0])}
        onValueCommit={(vals) => onSelect(vals[0])}
        disabled={isSubmitting}
        data-testid="slider-score"
        aria-label="Score"
      />
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{min}{labelFor(min) ? ` = ${labelFor(min)}` : ""}</span>
        <span>{max}{labelFor(max) ? ` = ${labelFor(max)}` : ""}</span>
      </div>
    </div>
  );
}

function PartitionControls({
  members,
  maxGroups,
  onSubmit,
  isSubmitting,
}: {
  members: PartitionMember[];
  maxGroups: number;
  onSubmit: (groups: string[][]) => void;
  isSubmitting?: boolean;
}) {
  // member id -> group index (0-based). Default: all in group 0 ⇒ "one concept" (coherent).
  const [assign, setAssign] = useState<Record<string, number>>({});
  useEffect(() => {
    setAssign(Object.fromEntries(members.map((m) => [m.id, 0])));
  }, [members]);

  if (members.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center" data-testid="partition-no-members">
        No member variables to group (this pair has no <code>sourceMetadata.members</code>).
      </p>
    );
  }

  // Show every group in use + one spare slot to split into (bounded by maxGroups).
  const highest = Math.max(0, ...members.map((m) => assign[m.id] ?? 0));
  const groupCount = Math.min(maxGroups, highest + 2);
  const distinct = new Set(members.map((m) => assign[m.id] ?? 0)).size;

  const submit = () => {
    const byGroup = new Map<number, string[]>();
    for (const m of members) {
      const g = assign[m.id] ?? 0;
      (byGroup.get(g) ?? byGroup.set(g, []).get(g)!).push(m.id);
    }
    onSubmit(Array.from(byGroup.values())); // groups with no members are never created
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground text-center">
        Tag each variable with the concept it belongs to. Keep them all in group A if they are ONE concept;
        move any that measure a different concept into another group.
      </p>
      <div className="space-y-2">
        {members.map((m) => (
          <div
            key={m.id}
            className="flex items-start gap-3 rounded-md border p-2"
            data-testid={`partition-member-${m.id}`}
          >
            <div className="flex gap-1 flex-wrap pt-0.5 shrink-0">
              {Array.from({ length: groupCount }).map((_, g) => (
                <Button
                  key={g}
                  size="sm"
                  variant={(assign[m.id] ?? 0) === g ? "default" : "outline"}
                  className="h-7 w-7 p-0 text-xs font-semibold"
                  onClick={() => setAssign((a) => ({ ...a, [m.id]: g }))}
                  disabled={isSubmitting}
                  data-testid={`partition-${m.id}-group-${g}`}
                >
                  {GROUP_LABELS[g] ?? g + 1}
                </Button>
              ))}
            </div>
            <span className="text-sm leading-snug">{m.text}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-center gap-4">
        <span className="text-xs text-muted-foreground" data-testid="partition-group-count">
          {distinct === 1 ? "One concept" : `${distinct} distinct concepts`}
        </span>
        <Button
          size="lg"
          className="h-12 px-6"
          onClick={submit}
          disabled={isSubmitting}
          data-testid="button-submit-partition"
        >
          {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : "Submit grouping"}
        </Button>
      </div>
    </div>
  );
}

export function ScoringControls({ scoring, isSubmitting, ...handlers }: ScoringControlsProps) {
  switch (scoring.mode) {
    case "binary":
      return (
        <BinaryControls
          labels={scoring.binary.labels}
          onSelect={handlers.onBinarySelect}
          isSubmitting={isSubmitting}
        />
      );
    case "numeric":
      return (
        <NumericControls
          min={scoring.numeric.min}
          max={scoring.numeric.max}
          labels={scoring.numeric.labels}
          value={handlers.numericValue}
          onSelect={handlers.onNumericSelect}
          isSubmitting={isSubmitting}
        />
      );
    case "partition":
      return (
        <PartitionControls
          members={handlers.members ?? []}
          maxGroups={scoring.partition.maxGroups}
          onSubmit={handlers.onPartitionSelect}
          isSubmitting={isSubmitting}
        />
      );
    default: {
      // Exhaustiveness guard: a new scoring mode must add a branch above.
      const _exhaustive: never = scoring;
      return _exhaustive;
    }
  }
}
