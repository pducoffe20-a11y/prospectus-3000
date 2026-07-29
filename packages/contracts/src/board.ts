import { z } from "zod";
import { OutreachPayloadSchema } from "./outreach.js";
import { prospectStatuses } from "./scoring.js";
import { httpUrlSchema } from "./primitives.js";

const ExternalFactSchema = z
  .object({
    claim: z.string(),
    source_label: z.string(),
    source_url: httpUrlSchema.nullable(),
    observed_at: z.string().datetime({ offset: true }).nullable(),
    confidence: z.number().min(0).max(1),
  })
  .strict();
const ExternalInferenceSchema = z
  .object({
    statement: z.string(),
    evidence_claim_ids: z.array(z.string()),
    confidence: z.number().min(0).max(1),
  })
  .strict();
const ExternalEvidenceNoteSchema = z
  .object({
    type: z.enum(["gap", "conflict", "freshness", "source"]),
    note: z.string(),
    evidence_claim_ids: z.array(z.string()),
  })
  .strict();
const ExternalStoryMatchSchema = z
  .object({
    story_id: z.string(),
    customer_name: z.string(),
    relevance: z.string(),
    proof_points: z.array(z.string()),
    confidence: z.number().min(0).max(1),
    source_url: httpUrlSchema.nullable(),
  })
  .strict();
const ExternalRecommendedActionSchema = z
  .object({
    order: z.number().int().positive(),
    action: z.string(),
    channel: z.enum(["email", "linkedin", "call", "research", "internal"]),
    due_at: z.string().datetime({ offset: true }).nullable(),
    rationale: z.string(),
    evidence_claim_ids: z.array(z.string()),
  })
  .strict();

const externalOutreach = z
  .object({
    ready_to_draft: z.boolean(),
    draft_goal: z.string().nullable(),
    recipient: z
      .object({
        full_name: z.string(),
        title: z.string(),
        organization: z.string(),
        email: z.string().email().nullable(),
        linkedin_url: httpUrlSchema.nullable(),
      })
      .strict(),
    context: z
      .object({
        verified_fact_ids: z.array(z.string()),
        permitted_inference_ids: z.array(z.string()),
        prohibited_claim_ids: z.array(z.string()),
        matched_customer_story_id: z.string().nullable(),
      })
      .strict(),
    constraints: z
      .object({
        voice_profile_version: z.string(),
        max_words: z.number().int().positive(),
        cta_style: z.enum([
          "soft_question",
          "permission_based",
          "light_next_step",
        ]),
        human_review_required: z.literal(true),
      })
      .strict(),
    draft_inputs: z
      .object({
        opening_fact_id: z.string().nullable(),
        likely_pain: z.string().nullable(),
        relevance_angle: z.string().nullable(),
        proof_points: z.array(z.string()),
        soft_cta: z.string().nullable(),
      })
      .strict(),
    draft_outputs: z
      .object({
        subject_line: z.string().nullable(),
        email_body: z.string().nullable(),
        linkedin_message: z.string().nullable(),
        call_opener: z.string().nullable(),
        follow_up: z.string().nullable(),
      })
      .strict(),
    review: z
      .object({
        review_status: z.enum([
          "needs_review",
          "changes_requested",
          "approved_for_send_prep",
        ]),
        reviewer_action: z.string(),
        review_flags: z.array(z.string()),
        fact_check_targets: z.array(z.string()),
        revision_requests: z.array(z.string()),
        changed_since_last_draft: z.array(z.string()),
      })
      .strict(),
    suppression_reason: z.string().nullable(),
  })
  .strict();

export const OutreachPreparationPayloadFileSchema = z
  .object({
    generated_at: z.string().datetime({ offset: true }),
    source_name: z.string(),
    workflow_stage: z.string(),
    records: z.array(
      z
        .object({
          prospect_id: z.string(),
          full_name: z.string(),
          title: z.string(),
          organization: z.string(),
          email: z.string().email().nullable(),
          linkedin_url: httpUrlSchema.nullable(),
          category: z.string(),
          status: z.enum(prospectStatuses),
          score_total: z.number(),
          scores: z
            .object({
              fit: z.number(),
              urgency: z.number(),
              persona: z.number(),
              evidence: z.number(),
            })
            .strict(),
          tenure_months: z.number().int().nonnegative().nullable(),
          provided_input_facts: z.array(ExternalFactSchema),
          public_research_facts: z.array(ExternalFactSchema),
          verified_facts: z.array(ExternalFactSchema),
          inferred_pains: z.array(ExternalInferenceSchema),
          inferred_angles: z.array(ExternalInferenceSchema),
          unknowns: z.array(
            z
              .object({
                question: z.string(),
                why_it_matters: z.string(),
                smallest_next_check: z.string().nullable(),
              })
              .strict(),
          ),
          what_to_check_first: z.string().nullable(),
          evidence_notes: z.array(ExternalEvidenceNoteSchema),
          matched_customer_story: ExternalStoryMatchSchema.nullable(),
          recommended_actions: z.array(ExternalRecommendedActionSchema),
          outreach_payload: externalOutreach,
        })
        .strict(),
    ),
  })
  .strict();
export type OutreachPreparationPayloadFile = z.infer<
  typeof OutreachPreparationPayloadFileSchema
>;
export const BoardSummaryFileSchema = z
  .object({
    title: z.string(),
    date_label: z.string(),
    total_records: z.number().int().nonnegative(),
    work_now_count: z.number().int().nonnegative(),
    light_research_count: z.number().int().nonnegative(),
    suppress_count: z.number().int().nonnegative(),
    key_themes: z.array(z.string()),
    evidence_gaps: z.array(z.string()),
    manager_readout: z.array(z.string()),
  })
  .strict();
export type BoardSummaryFile = z.infer<typeof BoardSummaryFileSchema>;
export { OutreachPayloadSchema };
