import { OutreachPayloadSchema, type OutreachPayload } from "./outreach.js";
import {
  OutreachPreparationPayloadFileSchema,
  type OutreachPreparationPayloadFile,
} from "./board.js";

type ExternalOutreach =
  OutreachPreparationPayloadFile["records"][number]["outreach_payload"];
export function serializeOutreachPayload(
  value: OutreachPayload,
): ExternalOutreach {
  const v = OutreachPayloadSchema.parse(value);
  return {
    ready_to_draft: v.readyToDraft,
    draft_goal: v.draftGoal,
    recipient: {
      full_name: v.recipient.fullName,
      title: v.recipient.title,
      organization: v.recipient.organization,
      email: v.recipient.email,
      linkedin_url: v.recipient.linkedinUrl,
    },
    context: {
      verified_fact_ids: v.context.verifiedFactIds,
      permitted_inference_ids: v.context.permittedInferenceIds,
      prohibited_claim_ids: v.context.prohibitedClaimIds,
      matched_customer_story_id: v.context.matchedCustomerStoryId,
    },
    constraints: {
      voice_profile_version: v.constraints.voiceProfileVersion,
      max_words: v.constraints.maxWords,
      cta_style: v.constraints.ctaStyle,
      human_review_required: true,
    },
    draft_inputs: {
      opening_fact_id: v.draftInputs.openingFactId,
      likely_pain: v.draftInputs.likelyPain,
      relevance_angle: v.draftInputs.relevanceAngle,
      proof_points: v.draftInputs.proofPoints,
      soft_cta: v.draftInputs.softCta,
    },
    draft_outputs: {
      subject_line: v.draftOutputs.subjectLine,
      email_body: v.draftOutputs.emailBody,
      linkedin_message: v.draftOutputs.linkedinMessage,
      call_opener: v.draftOutputs.callOpener,
      follow_up: v.draftOutputs.followUp,
    },
    review: {
      review_status: v.review.reviewStatus,
      reviewer_action: v.review.reviewerAction,
      review_flags: v.review.reviewFlags,
      fact_check_targets: v.review.factCheckTargets,
      revision_requests: v.review.revisionRequests,
      changed_since_last_draft: v.review.changedSinceLastDraft,
    },
    suppression_reason: v.suppressionReason,
  };
}
export function deserializeOutreachPayload(
  value: ExternalOutreach,
): OutreachPayload {
  const v =
    OutreachPreparationPayloadFileSchema.shape.records.element.shape.outreach_payload.parse(
      value,
    );
  return OutreachPayloadSchema.parse({
    readyToDraft: v.ready_to_draft,
    draftGoal: v.draft_goal,
    recipient: {
      fullName: v.recipient.full_name,
      title: v.recipient.title,
      organization: v.recipient.organization,
      email: v.recipient.email,
      linkedinUrl: v.recipient.linkedin_url,
    },
    context: {
      verifiedFactIds: v.context.verified_fact_ids,
      permittedInferenceIds: v.context.permitted_inference_ids,
      prohibitedClaimIds: v.context.prohibited_claim_ids,
      matchedCustomerStoryId: v.context.matched_customer_story_id,
    },
    constraints: {
      voiceProfileVersion: v.constraints.voice_profile_version,
      maxWords: v.constraints.max_words,
      ctaStyle: v.constraints.cta_style,
      humanReviewRequired: true,
    },
    draftInputs: {
      openingFactId: v.draft_inputs.opening_fact_id,
      likelyPain: v.draft_inputs.likely_pain,
      relevanceAngle: v.draft_inputs.relevance_angle,
      proofPoints: v.draft_inputs.proof_points,
      softCta: v.draft_inputs.soft_cta,
    },
    draftOutputs: {
      subjectLine: v.draft_outputs.subject_line,
      emailBody: v.draft_outputs.email_body,
      linkedinMessage: v.draft_outputs.linkedin_message,
      callOpener: v.draft_outputs.call_opener,
      followUp: v.draft_outputs.follow_up,
    },
    review: {
      reviewStatus: v.review.review_status,
      reviewerAction: v.review.reviewer_action,
      reviewFlags: v.review.review_flags,
      factCheckTargets: v.review.fact_check_targets,
      revisionRequests: v.review.revision_requests,
      changedSinceLastDraft: v.review.changed_since_last_draft,
    },
    suppressionReason: v.suppression_reason,
  });
}
