import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Plus, X } from "lucide-react";
import { ScoringControls } from "@/components/ScoringControls";
import { campaignConfigSchema, defaultNumericThresholds, type CampaignConfig } from "@shared/campaignConfig";

/**
 * Controlled editor for a campaign's CampaignConfig.
 *
 * Sections: Scoring Mode, Scoring Labels, Consensus Thresholds, Display Options,
 * Import Options. Scoring + Display expand by default; Consensus + Import are
 * collapsible (collapsed). A read-only ScoringControls preview shows what a
 * reviewer will see under the current scoring config.
 *
 * Mode-switch state preservation: switching binary<->numeric keeps each mode's
 * previously-entered fields in local state, so flipping back restores them. Only
 * the active mode's config is emitted via onChange.
 *
 * NO multi-criteria mode and NO templates here — both are deferred.
 */

type ScoringMode = "binary" | "numeric";
type BinaryScoring = Extract<CampaignConfig["scoring"], { mode: "binary" }>;
type NumericScoring = Extract<CampaignConfig["scoring"], { mode: "numeric" }>;

const DEFAULT_BINARY: BinaryScoring = {
  mode: "binary",
  binary: { labels: { positive: "Match", negative: "No Match", neutral: "Unsure" } },
};
const DEFAULT_NUMERIC: NumericScoring = {
  mode: "numeric",
  numeric: { min: 1, max: 5 },
};

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h4 className="text-sm font-semibold text-foreground">{children}</h4>;
}

function CollapsibleSection({
  title,
  description,
  defaultOpen,
  children,
  testid,
}: {
  title: string;
  description?: string;
  defaultOpen: boolean;
  children: React.ReactNode;
  testid: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border border-border rounded-md">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between p-3 text-left"
          data-testid={`config-section-${testid}`}
        >
          <SectionHeading>{title}</SectionHeading>
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 pb-3 space-y-3">
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

/** One-line muted description shown under a section heading. */
function SectionDescription({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}

export function CampaignConfigEditor({
  value,
  onChange,
}: {
  value: CampaignConfig;
  onChange: (next: CampaignConfig) => void;
}) {
  // Preserve the "other" mode's fields locally so switching back restores them.
  const [savedBinary, setSavedBinary] = useState<BinaryScoring>(
    value.scoring.mode === "binary" ? value.scoring : DEFAULT_BINARY,
  );
  const [savedNumeric, setSavedNumeric] = useState<NumericScoring>(
    value.scoring.mode === "numeric" ? value.scoring : DEFAULT_NUMERIC,
  );

  const mode = value.scoring.mode;

  const setScoring = (scoring: CampaignConfig["scoring"]) => {
    if (scoring.mode === "binary") setSavedBinary(scoring);
    else setSavedNumeric(scoring);
    onChange({ ...value, scoring });
  };

  const handleModeChange = (nextMode: ScoringMode) => {
    if (nextMode === mode) return;
    // Persist the current mode's fields, then restore the target mode's saved state.
    if (mode === "binary") setSavedBinary(value.scoring as BinaryScoring);
    else setSavedNumeric(value.scoring as NumericScoring);
    const restored = nextMode === "binary" ? savedBinary : savedNumeric;
    // Seed sensible numeric consensus thresholds the first time a campaign
    // switches to numeric (the schema requires both, with confirm > reject).
    if (
      nextMode === "numeric" &&
      (value.consensus.numericConfirmThreshold == null ||
        value.consensus.numericRejectThreshold == null)
    ) {
      const { min, max } = (restored as NumericScoring).numeric;
      const defaults = defaultNumericThresholds(min, max);
      onChange({
        ...value,
        scoring: restored,
        consensus: {
          ...value.consensus,
          numericConfirmThreshold: value.consensus.numericConfirmThreshold ?? defaults.numericConfirmThreshold,
          numericRejectThreshold: value.consensus.numericRejectThreshold ?? defaults.numericRejectThreshold,
        },
      });
      return;
    }
    onChange({ ...value, scoring: restored });
  };

  const setConsensus = (patch: Partial<CampaignConfig["consensus"]>) =>
    onChange({ ...value, consensus: { ...value.consensus, ...patch } });
  const setDisplay = (patch: Partial<CampaignConfig["display"]>) =>
    onChange({ ...value, display: { ...value.display, ...patch } });
  const setImport = (patch: Partial<CampaignConfig["import"]>) =>
    onChange({ ...value, import: { ...value.import, ...patch } });

  // Validation feedback from the shared schema (single source of truth).
  const issues = useMemo(() => {
    const parsed = campaignConfigSchema.safeParse(value);
    if (parsed.success) return new Map<string, string>();
    const map = new Map<string, string>();
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".");
      if (!map.has(key)) map.set(key, issue.message);
    }
    return map;
  }, [value]);
  const errorFor = (key: string) => issues.get(key);

  const FieldError = ({ k }: { k: string }) => {
    const msg = errorFor(k);
    return msg ? <p className="text-xs text-destructive" data-testid={`config-error-${k}`}>{msg}</p> : null;
  };

  // Numeric per-value label editing (stored as record keyed by stringified value).
  const numericLabels = mode === "numeric" ? (value.scoring as NumericScoring).numeric.labels ?? {} : {};
  const setNumericLabel = (k: string, label: string) => {
    const next = { ...numericLabels };
    if (label.trim() === "") delete next[k];
    else next[k] = label;
    const numeric = (value.scoring as NumericScoring).numeric;
    setScoring({
      mode: "numeric",
      numeric: { ...numeric, labels: Object.keys(next).length ? next : undefined },
    });
  };

  const prefixes = value.import.sourcePrefixes ?? [];

  return (
    <div className="space-y-4" data-testid="campaign-config-editor">
      {/* ---- Scoring Mode (expanded) ---- */}
      <div className="space-y-3 border border-border rounded-md p-3">
        <SectionHeading>Scoring Mode</SectionHeading>
        <SectionDescription>
          How reviewers score each pair: a yes/no/unsure choice (binary) or a numeric scale.
        </SectionDescription>
        <RadioGroup
          value={mode}
          onValueChange={(v) => handleModeChange(v as ScoringMode)}
          className="flex gap-6"
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem value="binary" id="mode-binary" data-testid="radio-mode-binary" />
            <Label htmlFor="mode-binary">Binary (match / no match / unsure)</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="numeric" id="mode-numeric" data-testid="radio-mode-numeric" />
            <Label htmlFor="mode-numeric">Numeric (scored range)</Label>
          </div>
        </RadioGroup>

        {/* ---- Scoring Labels (dynamic by mode) ---- */}
        <div className="space-y-3 pt-1">
          <SectionHeading>Scoring Labels</SectionHeading>
          <SectionDescription>
            The button/scale text reviewers see. Customize per campaign.
          </SectionDescription>
          {mode === "binary" ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor="label-positive">Positive</Label>
                <Input
                  id="label-positive"
                  value={(value.scoring as BinaryScoring).binary.labels.positive}
                  onChange={(e) =>
                    setScoring({
                      mode: "binary",
                      binary: {
                        labels: { ...(value.scoring as BinaryScoring).binary.labels, positive: e.target.value },
                      },
                    })
                  }
                  data-testid="input-label-positive"
                />
                <FieldError k="scoring.binary.labels.positive" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="label-negative">Negative</Label>
                <Input
                  id="label-negative"
                  value={(value.scoring as BinaryScoring).binary.labels.negative}
                  onChange={(e) =>
                    setScoring({
                      mode: "binary",
                      binary: {
                        labels: { ...(value.scoring as BinaryScoring).binary.labels, negative: e.target.value },
                      },
                    })
                  }
                  data-testid="input-label-negative"
                />
                <FieldError k="scoring.binary.labels.negative" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="label-neutral">Neutral</Label>
                <Input
                  id="label-neutral"
                  value={(value.scoring as BinaryScoring).binary.labels.neutral}
                  onChange={(e) =>
                    setScoring({
                      mode: "binary",
                      binary: {
                        labels: { ...(value.scoring as BinaryScoring).binary.labels, neutral: e.target.value },
                      },
                    })
                  }
                  data-testid="input-label-neutral"
                />
                <FieldError k="scoring.binary.labels.neutral" />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 max-w-xs">
                <div className="space-y-1">
                  <Label htmlFor="numeric-min">Min</Label>
                  <Input
                    id="numeric-min"
                    type="number"
                    value={(value.scoring as NumericScoring).numeric.min}
                    onChange={(e) =>
                      setScoring({
                        mode: "numeric",
                        numeric: {
                          ...(value.scoring as NumericScoring).numeric,
                          min: parseInt(e.target.value, 10) || 0,
                        },
                      })
                    }
                    data-testid="input-numeric-min"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="numeric-max">Max</Label>
                  <Input
                    id="numeric-max"
                    type="number"
                    value={(value.scoring as NumericScoring).numeric.max}
                    onChange={(e) =>
                      setScoring({
                        mode: "numeric",
                        numeric: {
                          ...(value.scoring as NumericScoring).numeric,
                          max: parseInt(e.target.value, 10) || 0,
                        },
                      })
                    }
                    data-testid="input-numeric-max"
                  />
                </div>
              </div>
              <FieldError k="scoring.numeric" />
              <div className="space-y-2">
                <Label>Per-value labels (optional)</Label>
                <div className="space-y-2">
                  {(() => {
                    const { min, max } = (value.scoring as NumericScoring).numeric;
                    const range: number[] = [];
                    if (max >= min && max - min <= 50) {
                      for (let i = min; i <= max; i++) range.push(i);
                    }
                    return range.map((n) => (
                      <div key={n} className="flex items-center gap-2">
                        <span className="w-8 text-sm tabular-nums text-muted-foreground">{n}</span>
                        <Input
                          value={numericLabels[String(n)] ?? ""}
                          placeholder={`Label for ${n}`}
                          onChange={(e) => setNumericLabel(String(n), e.target.value)}
                          data-testid={`input-numeric-label-${n}`}
                        />
                      </div>
                    ));
                  })()}
                </div>
              </div>
            </div>
          )}
          {/* Preview as reviewer (read-only) */}
          <div className="rounded-md border border-dashed border-border p-4 bg-muted/30 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Preview as reviewer</p>
            <div className="pointer-events-none opacity-90" data-testid="config-preview">
              <ScoringControls
                scoring={value.scoring}
                onBinarySelect={() => {}}
                onNumericSelect={() => {}}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ---- Display Options (expanded) ---- */}
      <div className="space-y-3 border border-border rounded-md p-3">
        <SectionHeading>Display Options</SectionHeading>
        <SectionDescription>
          Which panels appear on the review screen: external links, alternatives, metadata.
        </SectionDescription>
        <div className="flex items-center justify-between">
          <Label htmlFor="show-external-links">Show external links</Label>
          <Switch
            id="show-external-links"
            checked={value.display.showExternalLinks}
            onCheckedChange={(c) => setDisplay({ showExternalLinks: c })}
            data-testid="switch-show-external-links"
          />
        </div>
        {value.display.showExternalLinks && (
          <div className="space-y-1">
            <Label htmlFor="link-template">Link template</Label>
            <Input
              id="link-template"
              value={value.display.linkTemplate ?? ""}
              placeholder="https://example.org/{targetId}"
              onChange={(e) => setDisplay({ linkTemplate: e.target.value || undefined })}
              data-testid="input-link-template"
            />
            <FieldError k="display.linkTemplate" />
            <p className="text-xs text-muted-foreground">
              Must be https:// and contain the {"{targetId}"} placeholder.
            </p>
          </div>
        )}
        <div className="flex items-center justify-between">
          <Label htmlFor="show-alternatives">Show alternatives</Label>
          <Switch
            id="show-alternatives"
            checked={value.display.showAlternatives}
            onCheckedChange={(c) => setDisplay({ showAlternatives: c })}
            data-testid="switch-show-alternatives"
          />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="show-metadata-panel">Show metadata panel</Label>
          <Switch
            id="show-metadata-panel"
            checked={value.display.showMetadataPanel}
            onCheckedChange={(c) => setDisplay({ showMetadataPanel: c })}
            data-testid="switch-show-metadata-panel"
          />
        </div>
      </div>

      {/* ---- Consensus Thresholds (collapsed) ---- */}
      <CollapsibleSection
        title="Consensus Thresholds"
        description="How much agreement and how many votes decide a pair's evidence tier (confirmed / rejected / disputed)."
        defaultOpen={false}
        testid="consensus"
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label htmlFor="min-votes">Min votes</Label>
            <Input
              id="min-votes"
              type="number"
              min={1}
              value={value.consensus.minVotes}
              onChange={(e) => setConsensus({ minVotes: parseInt(e.target.value, 10) || 1 })}
              data-testid="input-min-votes"
            />
            <FieldError k="consensus.minVotes" />
            {value.consensus.minVotes >= 2 && (
              <p className="text-xs text-muted-foreground" data-testid="warning-min-votes">
                Needs {value.consensus.minVotes} distinct reviewers per pair before
                consensus is computed — with fewer active reviewers, pairs stay stuck
                in review.
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="confirm-pct">Confirm %</Label>
            <Input
              id="confirm-pct"
              type="number"
              min={0}
              max={100}
              value={value.consensus.confirmPct}
              onChange={(e) => setConsensus({ confirmPct: Number(e.target.value) })}
              data-testid="input-confirm-pct"
            />
            <FieldError k="consensus.confirmPct" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="reject-pct">Reject %</Label>
            <Input
              id="reject-pct"
              type="number"
              min={0}
              max={100}
              value={value.consensus.rejectPct}
              onChange={(e) => setConsensus({ rejectPct: Number(e.target.value) })}
              data-testid="input-reject-pct"
            />
            <FieldError k="consensus.rejectPct" />
          </div>
        </div>
        {mode === "numeric" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="numeric-confirm">Numeric confirm threshold (mean ≥)</Label>
              <Input
                id="numeric-confirm"
                type="number"
                step="any"
                value={value.consensus.numericConfirmThreshold ?? ""}
                onChange={(e) =>
                  setConsensus({
                    numericConfirmThreshold: e.target.value === "" ? undefined : Number(e.target.value),
                  })
                }
                data-testid="input-numeric-confirm"
              />
              <FieldError k="consensus.numericConfirmThreshold" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="numeric-reject">Numeric reject threshold (mean ≤)</Label>
              <Input
                id="numeric-reject"
                type="number"
                step="any"
                value={value.consensus.numericRejectThreshold ?? ""}
                onChange={(e) =>
                  setConsensus({
                    numericRejectThreshold: e.target.value === "" ? undefined : Number(e.target.value),
                  })
                }
                data-testid="input-numeric-reject"
              />
              <FieldError k="consensus.numericRejectThreshold" />
            </div>
          </div>
        )}
      </CollapsibleSection>

      {/* ---- Import Options (collapsed) ---- */}
      <CollapsibleSection
        title="Import Options"
        description="Optional filtering applied when importing pairs (e.g. drop same-source pairs)."
        defaultOpen={false}
        testid="import"
      >
        <div className="flex items-center justify-between">
          <Label htmlFor="source-prefix-filter">Filter imports by source prefix</Label>
          <Switch
            id="source-prefix-filter"
            checked={value.import.sourcePrefixFilter}
            onCheckedChange={(c) => setImport({ sourcePrefixFilter: c })}
            data-testid="switch-source-prefix-filter"
          />
        </div>
        {value.import.sourcePrefixFilter && (
          <div className="space-y-2">
            <Label>Source prefixes</Label>
            {prefixes.map((p, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <Input
                  value={p}
                  onChange={(e) => {
                    const next = [...prefixes];
                    next[idx] = e.target.value;
                    setImport({ sourcePrefixes: next });
                  }}
                  data-testid={`input-source-prefix-${idx}`}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setImport({ sourcePrefixes: prefixes.filter((_, i) => i !== idx) })}
                  data-testid={`button-remove-prefix-${idx}`}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() => setImport({ sourcePrefixes: [...prefixes, ""] })}
              data-testid="button-add-prefix"
            >
              <Plus className="w-4 h-4" />
              Add prefix
            </Button>
            <FieldError k="import.sourcePrefixes" />
          </div>
        )}
      </CollapsibleSection>
    </div>
  );
}
