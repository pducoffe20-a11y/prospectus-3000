import {
  conflictTypes,
  normalizeClaim,
  type ConflictType,
  type ReconciliationClaim,
} from "./normalize-claim.js";

export const EVIDENCE_RESOLUTION_POLICY_VERSION =
  "evidence-resolution/v1" as const;

export interface ConflictResolution {
  readonly kind: "superseded";
  readonly policyVersion: typeof EVIDENCE_RESOLUTION_POLICY_VERSION;
  readonly winnerClaimId: string;
  readonly supersededClaimIds: readonly string[];
  readonly reason: string;
  readonly resolvedAt: string;
  readonly resolvedBy: string;
  readonly audit: {
    readonly winnerFreshness: string;
    readonly winnerAuthority: string;
    readonly supersededFreshness: readonly string[];
    readonly supersededAuthorities: readonly string[];
  };
}

export interface ConflictResolutionRequest {
  readonly type: ConflictType;
  readonly accountId: string;
  readonly contactId: string | null;
  readonly winnerClaimId: string;
  readonly supersededClaimIds: readonly string[];
  readonly reason: string;
  readonly resolvedAt: string;
  readonly resolvedBy: string;
}

export interface ConflictDetectionOptions {
  readonly resolutions?: readonly ConflictResolutionRequest[];
}

export interface ConflictRecord {
  readonly id: string;
  readonly type: ConflictType;
  readonly accountId: string;
  readonly contactId: string | null;
  readonly subjectKey: string | null;
  readonly claimIds: readonly string[];
  readonly values: readonly {
    readonly normalizedValue: string;
    readonly claimIds: readonly string[];
  }[];
  readonly status: "unresolved" | "resolved";
  readonly resolution: ConflictResolution | null;
}

/**
 * Detects material disagreements without selecting a winner. A resolution is
 * applied only when the caller supplies an auditable request and the evidence
 * meets the conservative supersession gate.
 */
export function detectConflicts(
  inputClaims: readonly Readonly<ReconciliationClaim>[],
  options: ConflictDetectionOptions = {},
): ConflictRecord[] {
  const claims = [...inputClaims].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const groups = new Map<string, ReconciliationClaim[]>();
  for (const claim of claims) {
    const normalized = normalizeClaim(claim);
    const type = normalized.normalized.conflictType;
    if (!type) continue;
    const key = JSON.stringify([
      type,
      claim.accountId,
      claim.contactId,
      normalized.normalized.subjectKey,
    ]);
    const group = groups.get(key) ?? [];
    group.push(claim);
    groups.set(key, group);
  }

  const conflicts: ConflictRecord[] = [];
  for (const group of groups.values()) {
    const first = group[0];
    if (!first) continue;
    const firstNormalized = normalizeClaim(first);
    const type = firstNormalized.normalized.conflictType;
    if (!type) continue;
    const byValue = new Map<string, string[]>();
    for (const claim of group) {
      const value = normalizeClaim(claim).normalized.value;
      const ids = byValue.get(value) ?? [];
      ids.push(claim.id);
      byValue.set(value, ids);
    }
    if (byValue.size < 2) continue;
    const request = options.resolutions?.find((candidate) => {
      const candidateClaimIds = new Set([
        candidate.winnerClaimId,
        ...candidate.supersededClaimIds,
      ]);
      return (
        candidate.type === type &&
        candidate.accountId === first.accountId &&
        candidate.contactId === first.contactId &&
        candidateClaimIds.size === group.length &&
        group.every((claim) => candidateClaimIds.has(claim.id))
      );
    });
    const unresolved: ConflictRecord = {
      id: [
        type,
        first.accountId,
        first.contactId ?? "account",
        firstNormalized.normalized.subjectKey ?? "all",
      ].join(":"),
      type,
      accountId: first.accountId,
      contactId: first.contactId,
      subjectKey: firstNormalized.normalized.subjectKey,
      claimIds: group.map((claim) => claim.id).sort(),
      values: [...byValue]
        .map(([normalizedValue, claimIds]) => ({
          normalizedValue,
          claimIds: claimIds.sort(),
        }))
        .sort((left, right) =>
          left.normalizedValue.localeCompare(right.normalizedValue),
        ),
      status: "unresolved",
      resolution: null,
    };
    conflicts.push(
      request ? resolveConflict(unresolved, group, request) : unresolved,
    );
  }
  return conflicts.sort(
    (left, right) =>
      conflictTypes.indexOf(left.type) - conflictTypes.indexOf(right.type) ||
      left.accountId.localeCompare(right.accountId) ||
      (left.contactId ?? "").localeCompare(right.contactId ?? ""),
  );
}

/**
 * Returns a new record. It never changes the conflict, its claims, or a
 * historical run artifact.
 */
export function resolveConflict(
  conflict: Readonly<ConflictRecord>,
  claims: readonly Readonly<ReconciliationClaim>[],
  request: Readonly<ConflictResolutionRequest>,
): ConflictRecord {
  if (conflict.status === "resolved") return { ...conflict };
  validateResolutionRequest(conflict, claims, request);
  const byId = new Map(claims.map((claim) => [claim.id, claim]));
  const winner = byId.get(request.winnerClaimId);
  const superseded = request.supersededClaimIds.map((id) => byId.get(id));
  if (!winner || superseded.some((claim) => !claim))
    throw new Error("Resolution references a claim outside the conflict");
  const losingClaims = superseded
    .filter((claim): claim is ReconciliationClaim => claim !== undefined)
    .sort((left, right) => left.id.localeCompare(right.id));
  return {
    ...conflict,
    status: "resolved",
    resolution: {
      kind: "superseded",
      policyVersion: EVIDENCE_RESOLUTION_POLICY_VERSION,
      winnerClaimId: winner.id,
      supersededClaimIds: losingClaims.map((claim) => claim.id).sort(),
      reason: request.reason,
      resolvedAt: request.resolvedAt,
      resolvedBy: request.resolvedBy,
      audit: {
        winnerFreshness: winner.freshness,
        winnerAuthority: winner.sourceClass,
        supersededFreshness: losingClaims.map((claim) => claim.freshness),
        supersededAuthorities: losingClaims.map((claim) => claim.sourceClass),
      },
    },
  };
}

function validateResolutionRequest(
  conflict: Readonly<ConflictRecord>,
  claims: readonly Readonly<ReconciliationClaim>[],
  request: Readonly<ConflictResolutionRequest>,
): void {
  if (
    request.type !== conflict.type ||
    request.accountId !== conflict.accountId ||
    request.contactId !== conflict.contactId
  )
    throw new Error("Resolution does not identify this conflict");
  if (
    !request.reason.trim() ||
    !request.resolvedBy.trim() ||
    !Number.isFinite(Date.parse(request.resolvedAt))
  )
    throw new Error("Resolution requires an auditable reason, actor, and time");
  const conflictIds = new Set(conflict.claimIds);
  const supersededIds = new Set(request.supersededClaimIds);
  if (
    !conflictIds.has(request.winnerClaimId) ||
    request.supersededClaimIds.length === 0 ||
    supersededIds.size !== request.supersededClaimIds.length ||
    request.supersededClaimIds.some(
      (id) => !conflictIds.has(id) || id === request.winnerClaimId,
    ) ||
    [...conflictIds].some(
      (id) => id !== request.winnerClaimId && !supersededIds.has(id),
    )
  )
    throw new Error(
      "Resolution must identify the winner and every opposing conflict side",
    );
  const byId = new Map(claims.map((claim) => [claim.id, claim]));
  const winner = byId.get(request.winnerClaimId);
  const losers = request.supersededClaimIds.map((id) => byId.get(id));
  if (!winner || losers.some((claim) => !claim))
    throw new Error("Resolution references unavailable evidence");
  if (!["fresh", "recent"].includes(winner.freshness))
    throw new Error("Superseding evidence must be current");
  if (!isHighAuthority(winner.sourceClass))
    throw new Error("Superseding evidence must be high authority");
  for (const loser of losers) {
    if (!loser) continue;
    if (loser.freshness !== "stale")
      throw new Error("Only stale evidence may be superseded");
    if (authorityRank(winner) <= authorityRank(loser))
      throw new Error(
        "Superseding evidence must have demonstrably greater authority",
      );
    if (
      winner.publishedAt === null ||
      loser.publishedAt === null ||
      Date.parse(winner.publishedAt) <= Date.parse(loser.publishedAt)
    )
      throw new Error("Superseding evidence must be newer");
  }
}

function isHighAuthority(sourceClass: string): boolean {
  return authorityRankFrom(sourceClass) >= 70;
}

function authorityRank(claim: Readonly<ReconciliationClaim>): number {
  return authorityRankFrom(claim.sourceClass);
}

function authorityRankFrom(sourceClass: string): number {
  const value = sourceClass
    .toLowerCase()
    .replaceAll("-", "_")
    .replaceAll(" ", "_");
  const ranks: Readonly<Record<string, number>> = {
    official_announcement: 100,
    official: 80,
    government: 90,
    regulator: 90,
    primary_news: 70,
    reputable_secondary: 40,
    aggregator: 20,
    search_snippet: 10,
  };
  return ranks[value] ?? 0;
}
