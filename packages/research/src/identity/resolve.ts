import type {
  CandidateMatch,
  IdentityRecord,
  ResolutionKind,
} from "./types.js";

const exact = (left: string | undefined, right: string | undefined) =>
  Boolean(left && right && left === right);
export function resolveExact(
  left: IdentityRecord,
  right: IdentityRecord,
):
  | {
      kind: ResolutionKind;
      reason: string;
      confidence: 1;
      comparedFields: string[];
    }
  | undefined {
  const a = left.normalized,
    b = right.normalized;
  if (exact(a.sourceId, b.sourceId))
    return {
      kind: "stable-source-id",
      reason: "Exact stable source identifier",
      confidence: 1,
      comparedFields: ["sourceId"],
    };
  if (exact(a.email, b.email))
    return {
      kind: "email",
      reason: "Exact normalized contact email",
      confidence: 1,
      comparedFields: ["email"],
    };
  if (exact(a.domain, b.domain) && exact(a.organization, b.organization))
    return {
      kind: "domain-organization",
      reason: "Exact normalized domain with organization evidence",
      confidence: 1,
      comparedFields: ["domain", "organization"],
    };
  if (
    exact(a.organization, b.organization) &&
    exact(a.personName, b.personName)
  )
    return {
      kind: "organization-person",
      reason: "Exact normalized organization and person name",
      confidence: 1,
      comparedFields: ["organization", "personName"],
    };
  return undefined;
}
function similarity(left: string, right: string) {
  const previous = Array.from(
    { length: right.length + 1 },
    (_, index) => index,
  );
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = previous[0] ?? 0;
    previous[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const above = previous[j] ?? 0;
      previous[j] = Math.min(
        above + 1,
        (previous[j - 1] ?? 0) + 1,
        diagonal + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return (
    1 - (previous[right.length] ?? 0) / Math.max(left.length, right.length, 1)
  );
}
export function candidateMatch(
  left: IdentityRecord,
  right: IdentityRecord,
): CandidateMatch | undefined {
  const organizationLeft = left.normalized.organization,
    organizationRight = right.normalized.organization;
  if (
    !organizationLeft ||
    !organizationRight ||
    !exact(left.normalized.personName, right.normalized.personName)
  )
    return undefined;
  const score = similarity(organizationLeft, organizationRight);
  if (score < 0.75 || score === 1) return undefined;
  return {
    leftRecordId: left.recordId,
    rightRecordId: right.recordId,
    reason: "Similar organization and exact person name require review",
    confidence: Number((score * 0.85).toFixed(3)),
    comparedFields: ["organization", "personName"],
  };
}
