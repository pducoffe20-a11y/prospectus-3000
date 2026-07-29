import { z } from "zod";
export const prospectStatuses = [
  "work_now",
  "light_research",
  "suppress",
] as const;
export type ProspectStatus = (typeof prospectStatuses)[number];
export const ScoreDimensionsSchema = z
  .object({
    fit: z.number(),
    urgency: z.number(),
    persona: z.number(),
    evidence: z.number(),
  })
  .strict();
export type ScoreDimensions = z.infer<typeof ScoreDimensionsSchema>;
export const ScorecardSchema = z
  .object({
    id: z.string().min(1),
    prospectId: z.string().min(1),
    policyVersion: z.string().min(1),
    dimensions: ScoreDimensionsSchema,
    weightedTotal: z.number(),
    constrainedTotal: z.number(),
    capsApplied: z.array(z.string()),
    gatesPassed: z.array(z.string()),
    gatesFailed: z.array(z.string()),
    hardSuppressors: z.array(z.string()),
    evidenceClaimIds: z.array(z.string()),
    generatedAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type Scorecard = z.infer<typeof ScorecardSchema>;
export const ProspectDecisionSchema = z
  .object({
    prospectId: z.string().min(1),
    status: z.enum(prospectStatuses),
    confidence: z.number().min(0).max(1),
    rationale: z.string().min(1),
    scorecardId: z.string().min(1),
    supportingEvidenceClaimIds: z.array(z.string()),
    reviewFlags: z.array(z.string()),
    smallestNextResearchStep: z.string().min(1).nullable(),
    changeConditions: z.array(z.string()),
  })
  .strict();
export type ProspectDecision = z.infer<typeof ProspectDecisionSchema>;
