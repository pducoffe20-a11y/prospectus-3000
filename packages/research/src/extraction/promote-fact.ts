import { classifyFreshness } from "../freshness/classify.js";
import type { ClaimCandidate } from "./validate-claim.js";

const PROMOTABLE_AUTHORITIES = new Set([
  "official",
  "government",
  "regulator",
  "primary_news",
]);
export const promotionRejectionReasons = [
  "source_authority_not_allowed",
  "missing_attributable_excerpt",
  "invalid_dates",
  "material_conflict",
  "search_snippet_lead_only",
] as const;
export type PromotionResult =
  | {
      readonly promoted: true;
      readonly state: "publicly_verified";
      readonly candidate: ClaimCandidate;
      readonly freshness: ReturnType<typeof classifyFreshness>;
    }
  | {
      readonly promoted: false;
      readonly state: "unknown";
      readonly reason: (typeof promotionRejectionReasons)[number];
    };

/** Deterministic promotion gate. Model output can never bypass these checks. */
export function promoteFact(
  candidate: ClaimCandidate,
  options: {
    readonly asOf: string;
    readonly hasUnresolvedMaterialConflict: boolean;
  },
): PromotionResult {
  if (candidate.sourceAuthority === "search_snippet")
    return denied("search_snippet_lead_only");
  if (!PROMOTABLE_AUTHORITIES.has(candidate.sourceAuthority))
    return denied("source_authority_not_allowed");
  if (!candidate.supportingExcerpt.trim())
    return denied("missing_attributable_excerpt");
  const dates = [
    candidate.retrievedAt,
    options.asOf,
    candidate.publishedAt,
  ].filter((value): value is string => value !== null);
  if (
    dates.some((value) => !Number.isFinite(Date.parse(value))) ||
    (candidate.publishedAt !== null &&
      Date.parse(candidate.publishedAt) > Date.parse(candidate.retrievedAt))
  )
    return denied("invalid_dates");
  if (options.hasUnresolvedMaterialConflict) return denied("material_conflict");
  return {
    promoted: true,
    state: "publicly_verified",
    candidate,
    freshness: classifyFreshness(
      candidate.claimType,
      candidate.publishedAt,
      options.asOf,
    ),
  };
}

function denied(
  reason: Exclude<PromotionResult, { promoted: true }>["reason"],
): PromotionResult {
  return { promoted: false, state: "unknown", reason };
}
