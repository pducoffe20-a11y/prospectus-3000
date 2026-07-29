import type { PublicResearchAdapterDeclaration } from "../public-web/types.js";
import type {
  PublicSearchProvider,
  PublicSearchQuery,
  PublicSearchResult,
} from "./types.js";

export const publicSearchDeclaration = {
  id: "public-search",
  capabilities: ["public_research"],
  authority: {
    capability: "public_research",
    sources: ["configured_public_search_provider"],
    requiresCredential: false,
  },
} as const satisfies PublicResearchAdapterDeclaration;

export class PublicSearchAdapter {
  readonly declaration = publicSearchDeclaration;

  constructor(private readonly provider?: PublicSearchProvider) {}

  async search(query: PublicSearchQuery): Promise<PublicSearchResult> {
    if (this.provider === undefined) {
      return { kind: "limited", reason: "search_provider_unconfigured" };
    }
    return { kind: "success", results: await this.provider.search(query) };
  }
}
