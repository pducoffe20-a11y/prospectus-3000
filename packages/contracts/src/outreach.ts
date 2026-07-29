import { z } from "zod";
import { httpUrlSchema } from "./primitives.js";
export const reviewStatuses = [
  "needs_review",
  "changes_requested",
  "approved_for_send_prep",
] as const;
export type ReviewStatus = (typeof reviewStatuses)[number];
export const OutreachReviewSchema = z
  .object({
    reviewStatus: z.enum(reviewStatuses),
    reviewerAction: z.string(),
    reviewFlags: z.array(z.string()),
    factCheckTargets: z.array(z.string()),
    revisionRequests: z.array(z.string()),
    changedSinceLastDraft: z.array(z.string()),
  })
  .strict();
export type OutreachReview = z.infer<typeof OutreachReviewSchema>;
export const DraftInputsSchema = z
  .object({
    openingFactId: z.string().nullable(),
    likelyPain: z.string().nullable(),
    relevanceAngle: z.string().nullable(),
    proofPoints: z.array(z.string()),
    softCta: z.string().nullable(),
  })
  .strict();
export type DraftInputs = z.infer<typeof DraftInputsSchema>;
export const OutreachPayloadSchema = z
  .object({
    readyToDraft: z.boolean(),
    draftGoal: z.string().nullable(),
    recipient: z
      .object({
        fullName: z.string(),
        title: z.string(),
        organization: z.string(),
        email: z.string().email().nullable(),
        linkedinUrl: httpUrlSchema.nullable(),
      })
      .strict(),
    context: z
      .object({
        verifiedFactIds: z.array(z.string()),
        permittedInferenceIds: z.array(z.string()),
        prohibitedClaimIds: z.array(z.string()),
        matchedCustomerStoryId: z.string().nullable(),
      })
      .strict(),
    constraints: z
      .object({
        voiceProfileVersion: z.string().min(1),
        maxWords: z.number().int().positive(),
        ctaStyle: z.enum([
          "soft_question",
          "permission_based",
          "light_next_step",
        ]),
        humanReviewRequired: z.literal(true),
      })
      .strict(),
    draftInputs: DraftInputsSchema,
    draftOutputs: z
      .object({
        subjectLine: z.string().nullable(),
        emailBody: z.string().nullable(),
        linkedinMessage: z.string().nullable(),
        callOpener: z.string().nullable(),
        followUp: z.string().nullable(),
      })
      .strict(),
    review: OutreachReviewSchema,
    suppressionReason: z.string().nullable(),
  })
  .strict();
export type OutreachPayload = z.infer<typeof OutreachPayloadSchema>;
