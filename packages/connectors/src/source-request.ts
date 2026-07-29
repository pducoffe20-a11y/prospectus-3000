/** The finite set of source capabilities understood by the retrieval layer. */
export const sourceCapabilities = [
  "account_truth",
  "contact_truth",
  "communications",
  "calendar",
  "meeting_evidence",
  "internal_context",
  "public_research",
  "sales_intelligence",
  "customer_stories",
] as const;

export type SourceCapability = (typeof sourceCapabilities)[number];

/** JSON-compatible values only. Metadata is data and must never contain executable values. */
export type SourceMetadataValue =
  | string
  | number
  | boolean
  | null
  | readonly SourceMetadataValue[]
  | { readonly [key: string]: SourceMetadataValue };

export type SourceMetadata = Readonly<Record<string, SourceMetadataValue>>;

/** A bounded request passed to a source adapter. */
export interface SourceRequest {
  readonly capability: SourceCapability;
  readonly query: string;
  readonly requestedAt: string;
  readonly correlationId?: string;
  readonly accountId?: string;
  readonly contactId?: string;
  readonly sourceUrl?: string;
  readonly maximumDocuments?: number;
  readonly maximumExcerptCharacters?: number;
  readonly metadata?: SourceMetadata;
}
