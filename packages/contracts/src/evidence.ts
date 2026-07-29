import { z } from "zod";
import { httpUrlSchema } from "./primitives.js";

export const evidenceStates = [
  "provided",
  "publicly_verified",
  "inferred",
  "unknown",
  "conflicted",
] as const;
export const outreachPermissions = [
  "allowed",
  "hypothesis_only",
  "prohibited",
] as const;
export type EvidenceState = (typeof evidenceStates)[number];
export type OutreachPermission = (typeof outreachPermissions)[number];

const dateTime = z.string().datetime({ offset: true });
export const EvidenceClaimSchema = z
  .object({
    id: z.string().min(1),
    accountId: z.string().min(1),
    contactId: z.string().min(1).nullable(),
    claimType: z.string().min(1),
    claimText: z.string().min(1),
    state: z.enum(evidenceStates),
    sourceId: z.string().min(1),
    sourceClass: z.string().min(1),
    sourceUrl: httpUrlSchema.nullable(),
    sourceTitle: z.string().min(1),
    publishedAt: dateTime.nullable(),
    retrievedAt: dateTime,
    supportingExcerpt: z.string().min(1),
    contentHash: z.string().min(1),
    freshness: z.enum(["fresh", "recent", "stale", "unknown"]),
    confidence: z.number().min(0).max(1),
    corroborates: z.array(z.string()),
    contradicts: z.array(z.string()),
    affectsScores: z.array(z.enum(["fit", "urgency", "persona", "evidence"])),
    outreachPermission: z.enum(outreachPermissions),
    researchRunId: z.string().min(1),
  })
  .strict();
export type EvidenceClaim = z.infer<typeof EvidenceClaimSchema>;
