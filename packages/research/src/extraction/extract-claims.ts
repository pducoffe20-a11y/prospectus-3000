import {
  claimTypes,
  validateClaimCandidate,
  type ClaimCandidate,
  type ClaimValidation,
} from "./validate-claim.js";
import type {
  ClaimModelRequest,
  StructuredClaimModelAdapter,
} from "./model-adapter.js";

export interface ExtractionResult {
  readonly candidates: readonly ClaimCandidate[];
  readonly rejected: readonly Exclude<ClaimValidation, { accepted: true }>[];
}

export async function extractClaims(
  adapter: StructuredClaimModelAdapter,
  source: Omit<ClaimModelRequest, "allowedClaimTypes" | "outputMode">,
): Promise<ExtractionResult> {
  const output = await adapter.proposeClaimCandidates({
    ...source,
    allowedClaimTypes: claimTypes,
    outputMode: "claim_candidates_only",
  });
  const values = Array.isArray(output) ? output : [output];
  const candidates: ClaimCandidate[] = [];
  const rejected: Exclude<ClaimValidation, { accepted: true }>[] = [];
  for (const value of values) {
    const validation = validateClaimCandidate(value);
    if (validation.accepted) candidates.push(validation.candidate);
    else rejected.push(validation);
  }
  return { candidates, rejected };
}
