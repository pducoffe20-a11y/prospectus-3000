export type RetrievalDenialReason =
  | "invalid_url"
  | "unsupported_protocol"
  | "credentials_not_allowed"
  | "linkedin_not_retrievable"
  | "non_public_host"
  | "dns_unresolved"
  | "redirect_limit"
  | "unsupported_content_type"
  | "response_too_large";

export type RetrievalResult =
  | {
      status: "retrieved";
      requestedUrl: string;
      finalUrl: string;
      redirects: string[];
      contentType: string;
      body: string;
      bytes: number;
      retrievedAt: string;
    }
  | {
      status: "denied";
      requestedUrl: string;
      url?: string;
      reason: RetrievalDenialReason;
    }
  | {
      status: "failed";
      requestedUrl: string;
      url: string;
      reason: "network_error" | "http_error";
      httpStatus?: number;
    };

export interface SearchResult {
  title: string;
  url: string;
  snippet?: string;
}

export type SearchOutcome =
  | { status: "available"; results: SearchResult[] }
  | {
      status: "unavailable";
      results: [];
      reason: "not_configured" | "provider_error" | "invalid_response";
    };

export interface SearchProvider {
  search(query: string, signal?: AbortSignal): Promise<SearchResult[]>;
}
