import { normalizeClaim, type ReconciliationClaim } from "./normalize-claim.js";
import {
  assessSourceIndependence,
  type IndependenceReason,
  type SourceRelationshipContext,
} from "./source-independence.js";

export interface CorroborationRelationship {
  readonly type: "corroborates";
  readonly claimIds: readonly [string, string];
  readonly normalizedValue: string;
  readonly independenceReasons: readonly IndependenceReason[];
}

export interface CorroborationResult<T extends ReconciliationClaim> {
  readonly relationships: readonly CorroborationRelationship[];
  /** New claim objects with deterministic relation IDs; inputs are not mutated. */
  readonly claims: readonly T[];
}

/** Finds equivalent claims backed by genuinely independent source lineages. */
export function corroborateClaims<T extends ReconciliationClaim>(
  inputClaims: readonly Readonly<T>[],
  context: SourceRelationshipContext = {},
): CorroborationResult<T> {
  const claims = [...inputClaims].sort(compareClaims);
  const normalized = new Map(
    claims.map((claim) => [claim.id, normalizeClaim(claim)]),
  );
  const relationships: CorroborationRelationship[] = [];

  for (let leftIndex = 0; leftIndex < claims.length; leftIndex += 1) {
    const left = claims[leftIndex];
    if (!left) continue;
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < claims.length;
      rightIndex += 1
    ) {
      const right = claims[rightIndex];
      if (!right || !sameSubject(left, right)) continue;
      const leftNormalized = normalized.get(left.id);
      const rightNormalized = normalized.get(right.id);
      if (
        !leftNormalized ||
        !rightNormalized ||
        canonicalClaimType(leftNormalized) !==
          canonicalClaimType(rightNormalized) ||
        leftNormalized.normalized.subjectKey !==
          rightNormalized.normalized.subjectKey ||
        leftNormalized.normalized.value !== rightNormalized.normalized.value
      )
        continue;
      const independence = assessSourceIndependence(left, right, context);
      if (!independence.independent) continue;
      relationships.push({
        type: "corroborates",
        claimIds: [left.id, right.id],
        normalizedValue: leftNormalized.normalized.value,
        independenceReasons: independence.reasons,
      });
    }
  }

  const corroboratesById = new Map<string, Set<string>>();
  for (const relationship of relationships) {
    const [leftId, rightId] = relationship.claimIds;
    addRelation(corroboratesById, leftId, rightId);
    addRelation(corroboratesById, rightId, leftId);
  }
  return {
    relationships,
    claims: claims.map((claim) => ({
      ...claim,
      corroborates: [
        ...new Set([
          ...claim.corroborates,
          ...(corroboratesById.get(claim.id) ?? []),
        ]),
      ].sort(),
    })) as T[],
  };
}

function canonicalClaimType(claim: ReturnType<typeof normalizeClaim>): string {
  return claim.normalized.conflictType ?? claim.normalized.claimType;
}

function sameSubject(
  left: Readonly<ReconciliationClaim>,
  right: Readonly<ReconciliationClaim>,
): boolean {
  return (
    left.accountId === right.accountId &&
    (left.contactId === right.contactId ||
      (left.contactId === null && right.contactId === null))
  );
}

function addRelation(
  relations: Map<string, Set<string>>,
  fromId: string,
  toId: string,
): void {
  const values = relations.get(fromId) ?? new Set<string>();
  values.add(toId);
  relations.set(fromId, values);
}

function compareClaims(
  left: Readonly<ReconciliationClaim>,
  right: Readonly<ReconciliationClaim>,
): number {
  return left.id.localeCompare(right.id);
}
