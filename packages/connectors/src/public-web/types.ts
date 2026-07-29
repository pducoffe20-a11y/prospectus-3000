export type PublicResearchCapability = "public_research";

export interface AdapterAuthority {
  capability: PublicResearchCapability;
  /** Sources this adapter is allowed to contact. */
  sources: readonly string[];
  /** Explicitly documents whether a provider credential is part of the authority. */
  requiresCredential: boolean;
}

export interface PublicResearchAdapterDeclaration {
  id: string;
  capabilities: readonly PublicResearchCapability[];
  authority: AdapterAuthority;
}

export interface RetrievedDocument {
  url: string;
  title?: string;
  mediaType: string;
  text: string;
}

export type RetrievalAttempt =
  | { kind: "document"; document: RetrievedDocument }
  | { kind: "requires_browser"; url: string; reason: string }
  | { kind: "limited"; reason: string };

/**
 * Security-sensitive fetching lives behind this boundary. Implementations must
 * validate resolved addresses and every redirect before making a request.
 */
export interface ResearchRetrievalBoundary {
  retrieveHttp(url: URL): Promise<RetrievalAttempt>;
  extractPdf(document: RetrievedDocument): Promise<RetrievalAttempt>;
  renderBrowser(url: URL): Promise<RetrievalAttempt>;
}

export type PublicWebResult =
  | {
      kind: "success";
      document: RetrievedDocument;
      method: "http" | "pdf" | "browser";
    }
  | { kind: "limited"; reason: string };

export interface PublicWebRequest {
  /** A public HTTP(S) URL, or a domain which is normalized to HTTPS. */
  target: string;
  /** PDF extraction is opt-in authority supplied by the calling policy. */
  permitPdfExtraction?: boolean;
  /** Browser use is opt-in authority supplied by the calling policy. */
  approveBrowserRendering?: boolean;
}
