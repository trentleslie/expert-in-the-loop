import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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

/** A member variable the reviewer can flag as not-belonging (exclusion mode). */
export type ExclusionMember = { id: string; text: string };

type ScoringConfig = CampaignConfig["scoring"];

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
      // Exclusion selection: the members to review + the submit callback (excluded = flagged ids).
      members?: ExclusionMember[];
      onExclusionSelect?: (excluded: string[]) => void;
    }
);

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

function ExclusionControls({
  members,
  onSubmit,
  isSubmitting,
}: {
  members: ExclusionMember[];
  onSubmit: (excluded: string[]) => void;
  isSubmitting?: boolean;
}) {
  // member id -> flagged (does NOT belong). Default: nothing flagged ⇒ "one concept" (coherent).
  const [flagged, setFlagged] = useState<Record<string, boolean>>({});
  useEffect(() => {
    setFlagged({});
  }, [members]);

  if (members.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center" data-testid="exclusion-no-members">
        No member variables to review (this pair has no <code>sourceMetadata.members</code>).
      </p>
    );
  }

  const flaggedCount = members.filter((m) => flagged[m.id]).length;

  const submit = () => onSubmit(members.filter((m) => flagged[m.id]).map((m) => m.id));

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground text-center">
        These variables were clustered into one concept. Check any that do NOT belong; leave all unchecked
        if they are ONE concept.
      </p>
      <div className="space-y-2">
        {members.map((m) => {
          const isFlagged = !!flagged[m.id];
          return (
            <label
              key={m.id}
              className={`flex items-start gap-3 rounded-md border p-2 cursor-pointer ${
                isFlagged ? "border-destructive bg-destructive/5" : ""
              }`}
              data-testid={`exclusion-member-${m.id}`}
            >
              <Checkbox
                checked={isFlagged}
                onCheckedChange={(c) => setFlagged((f) => ({ ...f, [m.id]: c === true }))}
                disabled={isSubmitting}
                className="mt-0.5 shrink-0"
                data-testid={`exclusion-${m.id}-checkbox`}
              />
              <span className={`text-sm leading-snug ${isFlagged ? "line-through text-destructive" : ""}`}>
                {m.text}
              </span>
            </label>
          );
        })}
      </div>
      <div className="flex items-center justify-center gap-4">
        <span
          className={`text-xs ${flaggedCount === 0 ? "text-muted-foreground" : "text-destructive font-medium"}`}
          data-testid="exclusion-verdict"
        >
          {flaggedCount === 0 ? "One concept" : `Over-merge — ${flaggedCount} flagged`}
        </span>
        <Button
          size="lg"
          className="h-12 px-6"
          onClick={submit}
          disabled={isSubmitting}
          data-testid="button-submit-exclusion"
        >
          {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : "Submit"}
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
    case "exclusion":
      return (
        <ExclusionControls
          members={handlers.members ?? []}
          onSubmit={handlers.onExclusionSelect ?? (() => {})}
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
