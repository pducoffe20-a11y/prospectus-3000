import type { EvidenceClaim, ReasoningStep } from "@prospect-cockpit/contracts";

export const REASONING_TRACE_SCHEMA_VERSION = "reasoning-trace/v1" as const;

export interface TraceStep extends ReasoningStep {
  readonly dependsOnStepIds: readonly string[];
  readonly assertionScope: "prospect_specific" | "general";
  readonly epistemicStatus: "observed" | "inferred" | "hypothesis" | "unknown";
}

export interface TraceCorroboration {
  readonly claimIds: readonly string[];
  readonly independenceReasons: readonly string[];
}

export interface TraceConflictResolution {
  readonly winnerClaimId: string;
  readonly supersededClaimIds: readonly string[];
  readonly reason: string;
  readonly resolvedAt: string;
  readonly resolvedBy: string;
  readonly policyVersion: string;
  readonly audit: {
    readonly winnerFreshness: string;
    readonly winnerAuthority: string;
    readonly supersededFreshness: readonly string[];
    readonly supersededAuthorities: readonly string[];
  };
}

export interface TraceConflict {
  readonly id: string;
  readonly type: string;
  readonly subjectKey: string | null;
  readonly claimIds: readonly string[];
  readonly status: "unresolved" | "resolved";
  readonly resolution: TraceConflictResolution | null;
}

export interface ReasoningTrace {
  readonly schemaVersion: typeof REASONING_TRACE_SCHEMA_VERSION;
  readonly id: string;
  readonly researchRunId: string;
  readonly generatedAt: string;
  readonly facts: readonly EvidenceClaim[];
  readonly factClaimIds: readonly string[];
  readonly reconciliation: {
    readonly corroborations: readonly TraceCorroboration[];
    readonly conflicts: readonly TraceConflict[];
  };
  readonly steps: readonly TraceStep[];
}

export interface BuildTraceInput {
  readonly id: string;
  readonly researchRunId?: string;
  readonly runId?: string;
  readonly generatedAt?: string;
  readonly createdAt?: string;
  readonly facts?: readonly EvidenceClaim[];
  readonly evidenceClaims?: readonly EvidenceClaim[];
  readonly reconciliation?: {
    readonly corroborations?: readonly TraceCorroboration[];
    readonly conflicts?: readonly TraceConflict[];
  };
  readonly steps: readonly (ReasoningStep & {
    readonly dependsOnStepIds?: readonly string[];
    readonly assertionScope?: "prospect_specific" | "general";
    readonly epistemicStatus?:
      "observed" | "inferred" | "hypothesis" | "unknown";
  })[];
}

const STEP_ORDER = [
  "signal",
  "interpretation",
  "commercial_meaning",
  "decision",
  "action",
  "expected_outcome",
] as const;

/**
 * Builds a detached, deeply frozen run artifact. Facts remain verbatim so the
 * trace is inspectable back to source-specific language and provenance.
 */
export function buildTrace(input: BuildTraceInput): ReasoningTrace {
  const facts = input.facts ?? input.evidenceClaims ?? [];
  const runId = input.researchRunId ?? input.runId ?? input.id;
  const generatedAt = input.generatedAt ?? input.createdAt;
  if (!generatedAt || !Number.isFinite(Date.parse(generatedAt)))
    throw new Error("generatedAt or createdAt must be an ISO date-time");

  const copiedFacts = facts
    .map((fact) => cloneEvidenceClaim(fact))
    .sort((left, right) => left.id.localeCompare(right.id));
  const copiedSteps = input.steps.map((step, index) => {
    const explicitDependencies = step.dependsOnStepIds;
    const previous = index > 0 ? input.steps[index - 1] : undefined;
    const dependsOnStepIds =
      explicitDependencies ??
      (previous &&
      STEP_ORDER.indexOf(previous.type) < STEP_ORDER.indexOf(step.type)
        ? [previous.id]
        : []);
    return {
      id: step.id,
      type: step.type,
      statement: step.statement,
      evidenceClaimIds: [...step.evidenceClaimIds].sort(),
      counterEvidenceClaimIds: [...step.counterEvidenceClaimIds].sort(),
      confidence: step.confidence,
      assumptions: [...step.assumptions],
      validationQuestion: step.validationQuestion,
      dependsOnStepIds: canonicalStrings(dependsOnStepIds),
      assertionScope: step.assertionScope ?? "prospect_specific",
      epistemicStatus:
        step.epistemicStatus ??
        (step.type === "expected_outcome"
          ? "hypothesis"
          : step.evidenceClaimIds.length > 0
            ? "inferred"
            : "unknown"),
    } satisfies TraceStep;
  });

  return deepFreeze({
    schemaVersion: REASONING_TRACE_SCHEMA_VERSION,
    id: input.id,
    researchRunId: runId,
    generatedAt,
    facts: copiedFacts,
    factClaimIds: copiedFacts.map(({ id }) => id),
    reconciliation: {
      corroborations: (input.reconciliation?.corroborations ?? [])
        .map((relationship) => ({
          claimIds: canonicalStrings(relationship.claimIds),
          independenceReasons: canonicalStrings(
            relationship.independenceReasons,
          ),
        }))
        .sort((left, right) =>
          left.claimIds
            .join("\u0000")
            .localeCompare(right.claimIds.join("\u0000")),
        ),
      conflicts: (input.reconciliation?.conflicts ?? [])
        .map((conflict) => {
          const resolution = conflict.resolution;
          const superseded =
            resolution === null
              ? []
              : resolution.supersededClaimIds
                  .map((claimId, index) => ({
                    claimId,
                    freshness:
                      resolution.audit.supersededFreshness[index] ?? "",
                    authority:
                      resolution.audit.supersededAuthorities[index] ?? "",
                  }))
                  .sort((left, right) =>
                    left.claimId.localeCompare(right.claimId),
                  );
          return {
            ...conflict,
            claimIds: canonicalStrings(conflict.claimIds),
            resolution:
              resolution === null
                ? null
                : {
                    ...resolution,
                    supersededClaimIds: superseded.map(
                      ({ claimId }) => claimId,
                    ),
                    audit: {
                      ...resolution.audit,
                      supersededFreshness: superseded.map(
                        ({ freshness }) => freshness,
                      ),
                      supersededAuthorities: superseded.map(
                        ({ authority }) => authority,
                      ),
                    },
                  },
          };
        })
        .sort((left, right) => left.id.localeCompare(right.id)),
    },
    steps: copiedSteps,
  });
}

function cloneEvidenceClaim(claim: EvidenceClaim): EvidenceClaim {
  return {
    ...claim,
    corroborates: canonicalStrings(claim.corroborates),
    contradicts: canonicalStrings(claim.contradicts),
    affectsScores: canonicalStrings(claim.affectsScores),
  };
}

function canonicalStrings<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort();
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value))
      if (child && typeof child === "object") deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
