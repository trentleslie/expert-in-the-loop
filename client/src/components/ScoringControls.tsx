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

  // Large range: slider. Default to min until the reviewer moves it.
  const current = value ?? min;
  return (
    <div className="space-y-4 max-w-xl mx-auto px-2">
      <div className="flex items-center justify-center gap-3">
        <span className="text-3xl font-semibold tabular-nums" data-testid="numeric-slider-value">
          {current}
        </span>
        {labelFor(current) && (
          <span className="text-sm text-muted-foreground" data-testid="numeric-slider-label">
            {labelFor(current)}
          </span>
        )}
      </div>
      <Slider
        min={min}
        max={max}
        step={1}
        value={[current]}
        onValueChange={(vals) => onSelect(vals[0])}
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
    default: {
      // Exhaustiveness guard: a new scoring mode must add a branch above.
      const _exhaustive: never = scoring;
      return _exhaustive;
    }
  }
}
