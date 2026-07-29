import { z } from "zod";
export const ReasoningStepSchema = z
  .object({
    id: z.string().min(1),
    type: z.enum([
      "signal",
      "interpretation",
      "commercial_meaning",
      "decision",
      "action",
      "expected_outcome",
    ]),
    statement: z.string().min(1),
    evidenceClaimIds: z.array(z.string()),
    counterEvidenceClaimIds: z.array(z.string()),
    confidence: z.number().min(0).max(1),
    assumptions: z.array(z.string()),
    validationQuestion: z.string().min(1).nullable(),
  })
  .strict();
export type ReasoningStep = z.infer<typeof ReasoningStepSchema>;
