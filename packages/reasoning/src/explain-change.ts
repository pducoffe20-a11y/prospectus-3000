import type { EvidenceClaim } from "@prospect-cockpit/contracts";
import type {
  ReasoningTrace,
  TraceConflict,
  TraceStep,
} from "./build-trace.js";

export interface ChangedEvidenceClaim {
  readonly claimId: string;
  readonly reasons: readonly string[];
  readonly before: EvidenceClaim;
  readonly after: EvidenceClaim;
}

export interface ChangedReasoningStep {
  readonly stepId: string;
  readonly reasons: readonly string[];
  readonly before: TraceStep;
  readonly after: TraceStep;
}

export interface ChangedReconciliationConflict {
  readonly conflictId: string;
  readonly reasons: readonly string[];
  readonly before: TraceConflict;
  readonly after: TraceConflict;
}

export interface RunChangeExplanation {
  readonly fromRunId: string;
  readonly toRunId: string;
  readonly evidence: {
    readonly added: readonly string[];
    readonly removed: readonly string[];
    readonly stale: readonly string[];
    readonly conflicted: readonly string[];
    readonly newlyVerified: readonly string[];
    readonly changed: readonly ChangedEvidenceClaim[];
  };
  readonly reasoning: {
    readonly added: readonly string[];
    readonly removed: readonly string[];
    readonly changed: readonly ChangedReasoningStep[];
  };
  readonly reconciliation: {
    readonly added: readonly string[];
    readonly removed: readonly string[];
    readonly changed: readonly ChangedReconciliationConflict[];
    readonly addedCorroborations: readonly string[];
    readonly removedCorroborations: readonly string[];
  };
  readonly summary: readonly string[];
}

/**
 * Compares immutable snapshots by value and returns a new explanation artifact.
 * Neither historical run is mutated or annotated.
 */
export function explainChange(
  before: ReasoningTrace,
  after: ReasoningTrace,
): RunChangeExplanation {
  const beforeFacts = indexById(before.facts);
  const afterFacts = indexById(after.facts);
  const added = difference(afterFacts, beforeFacts);
  const removed = difference(beforeFacts, afterFacts);
  const commonFactIds = intersection(beforeFacts, afterFacts);
  const stale = commonFactIds.filter((id) => {
    const previous = beforeFacts.get(id);
    const current = afterFacts.get(id);
    return previous?.freshness !== "stale" && current?.freshness === "stale";
  });
  const conflicted = commonFactIds.filter((id) => {
    const previous = beforeFacts.get(id);
    const current = afterFacts.get(id);
    return (
      previous?.state !== "conflicted" &&
      (current?.state === "conflicted" ||
        (current?.contradicts.length ?? 0) >
          (previous?.contradicts.length ?? 0))
    );
  });
  const newlyVerified = [
    ...added.filter((id) => afterFacts.get(id)?.state === "publicly_verified"),
    ...commonFactIds.filter(
      (id) =>
        beforeFacts.get(id)?.state !== "publicly_verified" &&
        afterFacts.get(id)?.state === "publicly_verified",
    ),
  ].sort();
  const changedEvidence = commonFactIds
    .filter(
      (id) =>
        stableStringify(beforeFacts.get(id)) !==
        stableStringify(afterFacts.get(id)),
    )
    .map((id) => {
      const previous = beforeFacts.get(id);
      const current = afterFacts.get(id);
      if (!previous || !current)
        throw new Error(`Evidence claim ${id} disappeared during comparison`);
      return Object.freeze({
        claimId: id,
        reasons: Object.freeze(evidenceChangeReasons(previous, current)),
        before: previous,
        after: current,
      });
    });

  const beforeSteps = indexById(before.steps);
  const afterSteps = indexById(after.steps);
  const changed = intersection(beforeSteps, afterSteps)
    .filter(
      (id) =>
        stableStringify(beforeSteps.get(id)) !==
        stableStringify(afterSteps.get(id)),
    )
    .map((id) => {
      const previous = beforeSteps.get(id);
      const current = afterSteps.get(id);
      if (!previous || !current)
        throw new Error(`Reasoning step ${id} disappeared during comparison`);
      return Object.freeze({
        stepId: id,
        reasons: Object.freeze(changeReasons(previous, current)),
        before: previous,
        after: current,
      });
    });

  const reasoning = Object.freeze({
    added: Object.freeze(difference(afterSteps, beforeSteps)),
    removed: Object.freeze(difference(beforeSteps, afterSteps)),
    changed: Object.freeze(changed),
  });
  const beforeConflicts = indexById(before.reconciliation.conflicts);
  const afterConflicts = indexById(after.reconciliation.conflicts);
  const changedConflicts = intersection(beforeConflicts, afterConflicts)
    .filter(
      (id) =>
        stableStringify(beforeConflicts.get(id)) !==
        stableStringify(afterConflicts.get(id)),
    )
    .map((id) => {
      const previous = beforeConflicts.get(id);
      const current = afterConflicts.get(id);
      if (!previous || !current)
        throw new Error(`Conflict ${id} disappeared during comparison`);
      const reasons: string[] = [];
      if (previous.status !== current.status)
        reasons.push(
          `status changed from ${previous.status} to ${current.status}`,
        );
      if (
        stableStringify(previous.claimIds) !== stableStringify(current.claimIds)
      )
        reasons.push("conflict evidence changed");
      if (
        stableStringify(previous.resolution) !==
        stableStringify(current.resolution)
      )
        reasons.push("resolution audit changed");
      return Object.freeze({
        conflictId: id,
        reasons: Object.freeze(reasons),
        before: previous,
        after: current,
      });
    });
  const beforeCorroborations = new Map(
    before.reconciliation.corroborations.map((relationship) => [
      relationship.claimIds.join("|"),
      relationship,
    ]),
  );
  const afterCorroborations = new Map(
    after.reconciliation.corroborations.map((relationship) => [
      relationship.claimIds.join("|"),
      relationship,
    ]),
  );
  const reconciliation = Object.freeze({
    added: Object.freeze(difference(afterConflicts, beforeConflicts)),
    removed: Object.freeze(difference(beforeConflicts, afterConflicts)),
    changed: Object.freeze(changedConflicts),
    addedCorroborations: Object.freeze(
      difference(afterCorroborations, beforeCorroborations),
    ),
    removedCorroborations: Object.freeze(
      difference(beforeCorroborations, afterCorroborations),
    ),
  });
  const evidence = Object.freeze({
    added: Object.freeze(added),
    removed: Object.freeze(removed),
    stale: Object.freeze(stale),
    conflicted: Object.freeze(conflicted),
    newlyVerified: Object.freeze(newlyVerified),
    changed: Object.freeze(changedEvidence),
  });
  return Object.freeze({
    fromRunId: before.researchRunId,
    toRunId: after.researchRunId,
    evidence,
    reasoning,
    reconciliation,
    summary: Object.freeze(buildSummary(evidence, reasoning, reconciliation)),
  });
}

function evidenceChangeReasons(
  before: EvidenceClaim,
  after: EvidenceClaim,
): string[] {
  const labels: Readonly<Partial<Record<keyof EvidenceClaim, string>>> = {
    claimText: "claim text changed",
    state: "evidence state changed",
    sourceId: "source changed",
    sourceClass: "source authority changed",
    sourceUrl: "source URL changed",
    publishedAt: "publication date changed",
    retrievedAt: "retrieval date changed",
    supportingExcerpt: "supporting excerpt changed",
    contentHash: "source content changed",
    freshness: "freshness changed",
    confidence: "confidence changed",
    corroborates: "corroboration changed",
    contradicts: "counterevidence changed",
  };
  return (Object.keys(labels) as (keyof EvidenceClaim)[])
    .filter(
      (key) => stableStringify(before[key]) !== stableStringify(after[key]),
    )
    .map((key) => labels[key] ?? `${key} changed`);
}

function indexById<T extends { readonly id: string }>(
  values: readonly T[],
): ReadonlyMap<string, T> {
  return new Map(values.map((value) => [value.id, value]));
}

function difference<T>(
  left: ReadonlyMap<string, T>,
  right: ReadonlyMap<string, T>,
): string[] {
  return [...left.keys()].filter((id) => !right.has(id)).sort();
}

function intersection<T, U>(
  left: ReadonlyMap<string, T>,
  right: ReadonlyMap<string, U>,
): string[] {
  return [...left.keys()].filter((id) => right.has(id)).sort();
}

function changeReasons(before: TraceStep, after: TraceStep): string[] {
  const reasons: string[] = [];
  if (before.statement !== after.statement) reasons.push("statement changed");
  if (
    stableStringify(before.evidenceClaimIds) !==
    stableStringify(after.evidenceClaimIds)
  )
    reasons.push("supporting evidence changed");
  if (
    stableStringify(before.counterEvidenceClaimIds) !==
    stableStringify(after.counterEvidenceClaimIds)
  )
    reasons.push("counterevidence changed");
  if (before.confidence !== after.confidence)
    reasons.push("confidence changed");
  if (
    stableStringify(before.assumptions) !== stableStringify(after.assumptions)
  )
    reasons.push("assumptions changed");
  if (before.validationQuestion !== after.validationQuestion)
    reasons.push("validation question changed");
  if (
    stableStringify(before.dependsOnStepIds) !==
    stableStringify(after.dependsOnStepIds)
  )
    reasons.push("reasoning dependency changed");
  if (before.assertionScope !== after.assertionScope)
    reasons.push("assertion scope changed");
  if (before.epistemicStatus !== after.epistemicStatus)
    reasons.push("epistemic status changed");
  return reasons;
}

function buildSummary(
  evidence: RunChangeExplanation["evidence"],
  reasoning: RunChangeExplanation["reasoning"],
  reconciliation: RunChangeExplanation["reconciliation"],
): string[] {
  const lines: string[] = [];
  for (const key of [
    "added",
    "removed",
    "stale",
    "conflicted",
    "newlyVerified",
  ] as const)
    if (evidence[key].length) lines.push(`${key}: ${evidence[key].join(", ")}`);
  for (const claim of evidence.changed)
    lines.push(`evidence ${claim.claimId}: ${claim.reasons.join("; ")}`);
  if (reasoning.added.length)
    lines.push(`reasoning added: ${reasoning.added.join(", ")}`);
  if (reasoning.removed.length)
    lines.push(`reasoning removed: ${reasoning.removed.join(", ")}`);
  for (const step of reasoning.changed)
    lines.push(`reasoning ${step.stepId}: ${step.reasons.join("; ")}`);
  if (reconciliation.added.length)
    lines.push(`conflicts added: ${reconciliation.added.join(", ")}`);
  if (reconciliation.removed.length)
    lines.push(`conflicts removed: ${reconciliation.removed.join(", ")}`);
  for (const conflict of reconciliation.changed)
    lines.push(
      `conflict ${conflict.conflictId}: ${conflict.reasons.join("; ")}`,
    );
  if (reconciliation.addedCorroborations.length)
    lines.push(
      `corroborations added: ${reconciliation.addedCorroborations.join(", ")}`,
    );
  if (reconciliation.removedCorroborations.length)
    lines.push(
      `corroborations removed: ${reconciliation.removedCorroborations.join(", ")}`,
    );
  return lines;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sortValue(child)]),
    );
  return value;
}
