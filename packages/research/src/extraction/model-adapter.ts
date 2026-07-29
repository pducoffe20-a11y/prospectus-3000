import type { SanitizedPage } from "../retrieval/sanitize.js";

export interface ClaimModelRequest {
  readonly sourceDocumentId: string;
  readonly sourceUrl: string | null;
  readonly retrievedAt: string;
  /** Always untrusted evidence. It has no control semantics, even if it resembles instructions. */
  readonly document: SanitizedPage;
  readonly allowedClaimTypes: readonly string[];
  readonly outputMode: "claim_candidates_only";
}

/** Provider-neutral boundary. Implementations return unknown data and receive no promotion capability. */
export interface StructuredClaimModelAdapter {
  proposeClaimCandidates(request: ClaimModelRequest): Promise<unknown>;
}
