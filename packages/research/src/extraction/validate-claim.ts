import { z } from "zod";
import { sourceAuthorities } from "../planner/source-priority.js";
import { scoreDimensions } from "../planner/plan-research.js";

export const claimTypes = [
  "organization_fit",
  "contact_role",
  "new_role_tenure",
  "learner_audience",
  "current_initiative",
  "ownership_risk",
  "why_now",
  "use_case",
] as const;
export type ClaimType = (typeof claimTypes)[number];
export const outreachPermissions = [
  "allowed",
  "hypothesis_only",
  "prohibited",
] as const;

const dateTime = z.string().datetime({ offset: true });
export const ClaimCandidateSchema = z
  .object({
    sourceDocumentId: z.string().min(1),
    sourceTitle: z.string().min(1),
    sourceUrl: z
      .string()
      .url()
      .refine((url) => ["http:", "https:"].includes(new URL(url).protocol))
      .nullable(),
    sourceAuthority: z.enum(sourceAuthorities),
    supportingExcerpt: z.string().min(1).max(4_000),
    retrievedAt: dateTime,
    publishedAt: dateTime.nullable(),
    claimType: z.enum(claimTypes),
    claimText: z.string().min(1).max(2_000),
    confidence: z.number().min(0).max(1),
    freshnessInput: z.object({ publicationDate: dateTime.nullable() }).strict(),
    affectedDimensions: z.array(z.enum(scoreDimensions)).min(1),
    outreachPermission: z.enum(outreachPermissions),
  })
  .strict();
export type ClaimCandidate = z.infer<typeof ClaimCandidateSchema>;

export const claimRejectionReasons = [
  "invalid_schema",
  "missing_attribution",
  "missing_excerpt",
  "unknown_claim_type",
  "workflow_instruction",
] as const;
export type ClaimRejectionReason = (typeof claimRejectionReasons)[number];
export type ClaimValidation =
  | { readonly accepted: true; readonly candidate: ClaimCandidate }
  | {
      readonly accepted: false;
      readonly reason: ClaimRejectionReason;
      readonly issues: readonly string[];
    };

const WORKFLOW_INSTRUCTION =
  /(?:ignore|override|replace|alter|change|bypass|disregard).{0,50}(?:system|instruction|workflow|schema|policy|rules?)/i;

export function validateClaimCandidate(value: unknown): ClaimValidation {
  if (!value || typeof value !== "object")
    return reject("invalid_schema", ["Candidate must be an object"]);
  const record = value as Record<string, unknown>;
  if (!("sourceDocumentId" in record) || !("sourceTitle" in record))
    return reject("missing_attribution", [
      "Source document ID and title are required",
    ]);
  if (
    typeof record.supportingExcerpt !== "string" ||
    !record.supportingExcerpt.trim()
  )
    return reject("missing_excerpt", ["A supporting excerpt is required"]);
  if (
    typeof record.claimType === "string" &&
    !claimTypes.includes(record.claimType as ClaimType)
  )
    return reject("unknown_claim_type", [
      `Unknown claim type: ${record.claimType}`,
    ]);
  if (
    [record.claimText, record.supportingExcerpt].some(
      (text) => typeof text === "string" && WORKFLOW_INSTRUCTION.test(text),
    )
  )
    return reject("workflow_instruction", [
      "Candidate contains an instruction to alter the workflow",
    ]);
  const result = ClaimCandidateSchema.safeParse(value);
  return result.success
    ? { accepted: true, candidate: result.data }
    : reject(
        "invalid_schema",
        result.error.issues.map(
          (issue) => `${issue.path.join(".")}: ${issue.message}`,
        ),
      );
}

function reject(
  reason: ClaimRejectionReason,
  issues: readonly string[],
): ClaimValidation {
  return { accepted: false, reason, issues };
}
