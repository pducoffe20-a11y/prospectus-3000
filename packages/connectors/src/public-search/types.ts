import type { PublicResearchAdapterDeclaration } from "../public-web/types.js";

export interface PublicSearchQuery {
  query: string;
  limit?: number;
}

export interface PublicSearchHit {
  url: string;
  title: string;
  snippet: string;
}

export interface PublicSearchProvider {
  search(query: PublicSearchQuery): Promise<readonly PublicSearchHit[]>;
}

export type PublicSearchResult =
  | { kind: "success"; results: readonly PublicSearchHit[] }
  | { kind: "limited"; reason: "search_provider_unconfigured" };

export interface PublicSearchAdapterRegistration extends PublicResearchAdapterDeclaration {
  id: "public-search";
}
