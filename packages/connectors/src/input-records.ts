import { z } from "zod";
import { rawRecordSchema } from "./import/types.js";

const actorProvenanceSchema = z
  .object({
    actorId: z.string().min(1),
    recordedAt: z.string().datetime(),
  })
  .strict();

const referenceAuthoritySchema = z
  .object({
    basis: z.literal("user-provided"),
    scope: z.literal("reference-only"),
  })
  .strict();

/**
 * Inputs deliberately supplied by a user. These are evidence inputs, not public
 * crawling requests, credentials, or permission to access the referenced site.
 */
export const connectorInputRecordSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("user-provided-url"),
      url: z
        .string()
        .url()
        .refine((value) => /^https?:\/\//i.test(value), {
          message: "Only HTTP(S) URLs are accepted",
        }),
      provenance: actorProvenanceSchema,
      authority: referenceAuthoritySchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("manual-note"),
      note: z.string().min(1),
      provenance: actorProvenanceSchema,
      authority: z
        .object({
          basis: z.literal("user-authored"),
          scope: z.literal("note-only"),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("authorized-user-import"),
      data: rawRecordSchema,
      provenance: actorProvenanceSchema.extend({
        sourceFilename: z.string().min(1),
        importRunId: z.string().min(1),
      }),
      authority: z
        .object({
          basis: z.literal("user-authorized-import"),
          scope: z.literal("imported-data-only"),
          authorizationId: z.string().min(1),
        })
        .strict(),
    })
    .strict(),
]);

export type ConnectorInputRecord = z.infer<typeof connectorInputRecordSchema>;

export function parseConnectorInputRecord(
  input: unknown,
): ConnectorInputRecord {
  return connectorInputRecordSchema.parse(input);
}
