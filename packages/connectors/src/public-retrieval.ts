import { z } from "zod";

export const PUBLIC_RETRIEVAL_OPERATION = "fetch-public-url" as const;

const publicHttpUrlSchema = z
  .string()
  .url()
  .superRefine((value, context) => {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:")
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Only HTTP(S) URLs are allowed",
      });
    if (
      url.hostname === "linkedin.com" ||
      url.hostname.endsWith(".linkedin.com")
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "LinkedIn URLs are reference-only and cannot be publicly retrieved",
      });
  });

/** A crawl request is intentionally distinct from a user-supplied connector input. */
export const publicRetrievalRequestSchema = z
  .object({
    kind: z.literal(PUBLIC_RETRIEVAL_OPERATION),
    url: publicHttpUrlSchema,
  })
  .strict();

export type PublicRetrievalRequest = z.infer<
  typeof publicRetrievalRequestSchema
>;

export interface PublicRetrievalAdapter<Result = unknown> {
  id: string;
  operationKinds: readonly [typeof PUBLIC_RETRIEVAL_OPERATION];
  dispatch(request: PublicRetrievalRequest): Promise<Result>;
}

const allowedOperationKinds = new Set<string>([PUBLIC_RETRIEVAL_OPERATION]);

export class PublicRetrievalRegistry {
  readonly #adapters = new Map<string, PublicRetrievalAdapter>();

  register(adapter: PublicRetrievalAdapter): void {
    if (
      adapter.operationKinds.length !== 1 ||
      adapter.operationKinds.some(
        (kind: string) => !allowedOperationKinds.has(kind),
      )
    )
      throw new Error("Adapter exposes a prohibited operation kind");
    if (this.#adapters.has(adapter.id))
      throw new Error(`Adapter already registered: ${adapter.id}`);
    this.#adapters.set(adapter.id, adapter);
  }

  async dispatch(adapterId: string, request: unknown): Promise<unknown> {
    const parsed = publicRetrievalRequestSchema.safeParse(request);
    if (!parsed.success)
      throw new Error(
        `Public retrieval request denied: ${parsed.error.issues[0]?.message ?? "invalid request"}`,
      );
    const adapter = this.#adapters.get(adapterId);
    if (!adapter)
      throw new Error(`Unknown public retrieval adapter: ${adapterId}`);
    return adapter.dispatch(parsed.data);
  }
}
