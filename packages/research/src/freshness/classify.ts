import type { ClaimType } from "../extraction/validate-claim.js";

export const FRESHNESS_POLICY_VERSION = "2026-07-29.v1";
export const FRESHNESS_THRESHOLDS_DAYS: Readonly<
  Record<ClaimType, { fresh: number; recent: number }>
> = Object.freeze({
  organization_fit: { fresh: 365, recent: 730 },
  contact_role: { fresh: 90, recent: 180 },
  new_role_tenure: { fresh: 90, recent: 180 },
  learner_audience: { fresh: 365, recent: 730 },
  current_initiative: { fresh: 120, recent: 365 },
  ownership_risk: { fresh: 30, recent: 90 },
  why_now: { fresh: 120, recent: 365 },
  use_case: { fresh: 365, recent: 730 },
});
export type Freshness = "fresh" | "recent" | "stale" | "unknown";

export interface FreshnessResult {
  readonly classification: Freshness;
  readonly policyVersion: typeof FRESHNESS_POLICY_VERSION;
  readonly ageDays: number | null;
}

export function classifyFreshness(
  claimType: ClaimType,
  publishedAt: string | null,
  asOf: string,
): FreshnessResult {
  if (publishedAt === null)
    return {
      classification: "unknown",
      policyVersion: FRESHNESS_POLICY_VERSION,
      ageDays: null,
    };
  const published = Date.parse(publishedAt);
  const current = Date.parse(asOf);
  if (
    !Number.isFinite(published) ||
    !Number.isFinite(current) ||
    published > current
  )
    return {
      classification: "unknown",
      policyVersion: FRESHNESS_POLICY_VERSION,
      ageDays: null,
    };
  const ageDays = Math.floor((current - published) / 86_400_000);
  const threshold = FRESHNESS_THRESHOLDS_DAYS[claimType];
  return {
    classification:
      ageDays <= threshold.fresh
        ? "fresh"
        : ageDays <= threshold.recent
          ? "recent"
          : "stale",
    policyVersion: FRESHNESS_POLICY_VERSION,
    ageDays,
  };
}
