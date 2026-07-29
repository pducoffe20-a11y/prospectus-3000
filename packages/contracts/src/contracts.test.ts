import assert from "node:assert/strict";
import test from "node:test";
import {
  EvidenceClaimSchema,
  OutreachPayloadSchema,
  deserializeOutreachPayload,
  serializeOutreachPayload,
} from "./index.js";

const claim = {
  id: "ev-1",
  accountId: "a-1",
  contactId: null,
  claimType: "initiative",
  claimText: "Launch announced",
  state: "publicly_verified",
  sourceId: "s-1",
  sourceClass: "official",
  sourceUrl: "https://example.test/news",
  sourceTitle: "News",
  publishedAt: null,
  retrievedAt: "2026-07-29T12:00:00Z",
  supportingExcerpt: "Launch announced for fall.",
  contentHash: "sha256:test",
  freshness: "fresh",
  confidence: 0.9,
  corroborates: [],
  contradicts: [],
  affectsScores: ["urgency"],
  outreachPermission: "allowed",
  researchRunId: "run-1",
} as const;
test("evidence accepts explicit null and rejects missing source, unsafe URL, and unknown enum", () => {
  assert.equal(EvidenceClaimSchema.parse(claim).contactId, null);
  assert.equal(
    EvidenceClaimSchema.safeParse({ ...claim, sourceId: undefined }).success,
    false,
  );
  assert.equal(
    EvidenceClaimSchema.safeParse({
      ...claim,
      sourceUrl: "javascript:alert(1)",
    }).success,
    false,
  );
  assert.equal(
    EvidenceClaimSchema.safeParse({ ...claim, state: "verified" }).success,
    false,
  );
  assert.equal(
    EvidenceClaimSchema.safeParse({ ...claim, extra: true }).success,
    false,
  );
});
const outreach = {
  readyToDraft: true,
  draftGoal: "Start a conversation",
  recipient: {
    fullName: "Maya Chen",
    title: "VP",
    organization: "NCF",
    email: null,
    linkedinUrl: null,
  },
  context: {
    verifiedFactIds: ["ev-1"],
    permittedInferenceIds: [],
    prohibitedClaimIds: [],
    matchedCustomerStoryId: null,
  },
  constraints: {
    voiceProfileVersion: "v1",
    maxWords: 100,
    ctaStyle: "soft_question",
    humanReviewRequired: true,
  },
  draftInputs: {
    openingFactId: "ev-1",
    likelyPain: null,
    relevanceAngle: null,
    proofPoints: [],
    softCta: "Open to comparing notes?",
  },
  draftOutputs: {
    subjectLine: null,
    emailBody: null,
    linkedinMessage: null,
    callOpener: null,
    followUp: null,
  },
  review: {
    reviewStatus: "needs_review",
    reviewerAction: "Fact-check",
    reviewFlags: [],
    factCheckTargets: [],
    revisionRequests: [],
    changedSinceLastDraft: [],
  },
  suppressionReason: null,
} as const;
test("outreach serializer uses exact snake_case and round-trips nulls losslessly", () => {
  const parsed = OutreachPayloadSchema.parse(outreach);
  const external = serializeOutreachPayload(parsed);
  assert.equal(external.ready_to_draft, true);
  assert.equal("readyToDraft" in external, false);
  assert.deepEqual(deserializeOutreachPayload(external), parsed);
});
test("review values and human review invariant are closed", () => {
  assert.equal(
    OutreachPayloadSchema.safeParse({
      ...outreach,
      review: { ...outreach.review, reviewStatus: "sent" },
    }).success,
    false,
  );
  assert.equal(
    OutreachPayloadSchema.safeParse({
      ...outreach,
      constraints: { ...outreach.constraints, humanReviewRequired: false },
    }).success,
    false,
  );
});
