import type { ReasoningTrace, TraceStep } from "./build-trace.js";

export const traceValidationCodes = [
  "duplicate_step_id",
  "unknown_evidence",
  "unknown_reconciliation_evidence",
  "invalid_resolution",
  "unsupported_assertion",
  "missing_predecessor",
  "hidden_material_conflict",
  "action_without_decision",
  "action_without_evidence",
  "guaranteed_expected_outcome",
] as const;

export interface TraceValidationIssue {
  readonly code: (typeof traceValidationCodes)[number];
  readonly stepId: string;
  readonly message: string;
}

export interface TraceValidationResult {
  readonly valid: boolean;
  readonly issues: readonly TraceValidationIssue[];
  /** Alias retained for consumers that conventionally read validation errors. */
  readonly errors: readonly TraceValidationIssue[];
}

const PREDECESSOR: Readonly<
  Partial<Record<TraceStep["type"], TraceStep["type"]>>
> = {
  interpretation: "signal",
  commercial_meaning: "interpretation",
  decision: "commercial_meaning",
  action: "decision",
  expected_outcome: "action",
};

const GUARANTEE_LANGUAGE =
  /\b(?:guarantee(?:d|s)?|ensure(?:d|s)?|certain(?:ly)?|will definitely|cannot fail)\b/i;
const ASSERTIVE_FUTURE = /\bwill\b/i;
const HYPOTHESIS_LANGUAGE =
  /\b(?:may|might|could|likely|hypothesi[sz]e[ds]?|expected|potential|anticipat(?:e|ed|es))\b/i;

export function validateTrace(trace: ReasoningTrace): TraceValidationResult {
  const issues: TraceValidationIssue[] = [];
  const factIds = new Set(trace.facts.map(({ id }) => id));
  const conflictedFactIds = new Set([
    ...trace.facts
      .filter(
        (fact) =>
          fact.state === "conflicted" ||
          fact.contradicts.length > 0 ||
          trace.facts.some((other) => other.contradicts.includes(fact.id)),
      )
      .map(({ id }) => id),
    ...trace.reconciliation.conflicts
      .filter(({ status }) => status === "unresolved")
      .flatMap(({ claimIds }) => claimIds),
  ]);
  const stepsById = new Map<string, TraceStep>();

  for (const relationship of trace.reconciliation.corroborations)
    for (const claimId of relationship.claimIds)
      if (!factIds.has(claimId))
        issues.push(
          Object.freeze({
            code: "unknown_reconciliation_evidence",
            stepId: "reconciliation:corroboration",
            message: `Corroboration references evidence claim ${claimId} outside this run`,
          }),
        );
  for (const conflict of trace.reconciliation.conflicts) {
    const conflictClaimIds = new Set(conflict.claimIds);
    for (const claimId of conflict.claimIds)
      if (!factIds.has(claimId))
        issues.push(
          Object.freeze({
            code: "unknown_reconciliation_evidence",
            stepId: `reconciliation:${conflict.id}`,
            message: `Conflict references evidence claim ${claimId} outside this run`,
          }),
        );
    const resolution = conflict.resolution;
    const resolutionIsValid =
      conflict.status === "unresolved"
        ? resolution === null
        : resolution !== null &&
          conflictClaimIds.has(resolution.winnerClaimId) &&
          new Set(resolution.supersededClaimIds).size ===
            resolution.supersededClaimIds.length &&
          resolution.supersededClaimIds.length ===
            conflict.claimIds.length - 1 &&
          resolution.supersededClaimIds.every(
            (claimId) =>
              conflictClaimIds.has(claimId) &&
              claimId !== resolution.winnerClaimId,
          ) &&
          conflict.claimIds.every(
            (claimId) =>
              claimId === resolution.winnerClaimId ||
              resolution.supersededClaimIds.includes(claimId),
          ) &&
          resolution.reason.trim().length > 0 &&
          resolution.resolvedBy.trim().length > 0 &&
          resolution.policyVersion.trim().length > 0 &&
          resolution.audit.winnerFreshness.trim().length > 0 &&
          resolution.audit.winnerAuthority.trim().length > 0 &&
          resolution.audit.supersededFreshness.length ===
            resolution.supersededClaimIds.length &&
          resolution.audit.supersededAuthorities.length ===
            resolution.supersededClaimIds.length &&
          Number.isFinite(Date.parse(resolution.resolvedAt));
    if (!resolutionIsValid)
      issues.push(
        Object.freeze({
          code: "invalid_resolution",
          stepId: `reconciliation:${conflict.id}`,
          message:
            "Conflict status and resolution audit record are inconsistent",
        }),
      );
  }

  for (const step of trace.steps) {
    if (stepsById.has(step.id))
      add(
        issues,
        "duplicate_step_id",
        step,
        `Reasoning step ID ${step.id} is duplicated`,
      );
    stepsById.set(step.id, step);
    for (const evidenceId of [
      ...step.evidenceClaimIds,
      ...step.counterEvidenceClaimIds,
    ])
      if (!factIds.has(evidenceId))
        add(
          issues,
          "unknown_evidence",
          step,
          `Evidence claim ${evidenceId} is not present in this run`,
        );
    if (
      step.assertionScope === "prospect_specific" &&
      step.evidenceClaimIds.length === 0 &&
      (step.assumptions.length === 0 || step.validationQuestion === null)
    )
      add(
        issues,
        "unsupported_assertion",
        step,
        "A prospect-specific assertion needs evidence or a clearly labeled assumption",
      );
  }

  const seenStepIds = new Set<string>();
  for (const step of trace.steps) {
    const predecessorType = PREDECESSOR[step.type];
    const dependencies = step.dependsOnStepIds
      .map((id) => stepsById.get(id))
      .filter((value): value is TraceStep => value !== undefined);
    if (
      predecessorType &&
      !dependencies.some(
        (dependency) =>
          dependency.type === predecessorType && seenStepIds.has(dependency.id),
      )
    )
      add(
        issues,
        "missing_predecessor",
        step,
        `${step.type} must trace to an earlier ${predecessorType} step`,
      );
    if (
      step.type === "decision" &&
      conflictedFactIds.size > 0 &&
      [...conflictedFactIds].some(
        (id) =>
          !step.evidenceClaimIds.includes(id) &&
          !step.counterEvidenceClaimIds.includes(id),
      )
    )
      add(
        issues,
        "hidden_material_conflict",
        step,
        "A decision cannot hide a material unresolved evidence conflict",
      );
    if (step.type === "action") {
      if (!dependencies.some((dependency) => dependency.type === "decision"))
        add(
          issues,
          "action_without_decision",
          step,
          "An action must trace to a decision",
        );
      if (step.evidenceClaimIds.length === 0)
        add(
          issues,
          "action_without_evidence",
          step,
          "An action must trace to supporting evidence",
        );
    }
    if (
      step.type === "expected_outcome" &&
      (step.epistemicStatus !== "hypothesis" ||
        step.confidence >= 1 ||
        GUARANTEE_LANGUAGE.test(step.statement) ||
        (ASSERTIVE_FUTURE.test(step.statement) &&
          !HYPOTHESIS_LANGUAGE.test(step.statement)))
    )
      add(
        issues,
        "guaranteed_expected_outcome",
        step,
        "An expected outcome must remain a hypothesis, not a guarantee",
      );
    seenStepIds.add(step.id);
  }

  return Object.freeze({
    valid: issues.length === 0,
    issues: Object.freeze(issues),
    errors: Object.freeze([...issues]),
  });
}

function add(
  issues: TraceValidationIssue[],
  code: TraceValidationIssue["code"],
  step: TraceStep,
  message: string,
): void {
  issues.push(Object.freeze({ code, stepId: step.id, message }));
}
