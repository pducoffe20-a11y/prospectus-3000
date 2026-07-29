import type {
  PublicResearchAdapterDeclaration,
  PublicWebRequest,
  PublicWebResult,
  ResearchRetrievalBoundary,
  RetrievalAttempt,
} from "./types.js";

export const publicWebDeclaration = {
  id: "public-web",
  capabilities: ["public_research"],
  authority: {
    capability: "public_research",
    sources: ["user_supplied_public_http_url", "user_supplied_public_domain"],
    requiresCredential: false,
  },
} as const satisfies PublicResearchAdapterDeclaration;

const domainPattern =
  /^(?:[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?\.)+[a-z]{2,63}(?::\d{1,5})?(?:\/.*)?$/i;

export function normalizePublicTarget(target: string): URL {
  const value = target.trim();
  if (value.length === 0)
    throw new TypeError("Public target must not be empty");

  const candidate = domainPattern.test(value) ? `https://${value}` : value;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new TypeError("Public target must be an HTTP(S) URL or domain");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError("Public target must use HTTP or HTTPS");
  }
  if (url.username || url.password) {
    throw new TypeError("Public target must not contain credentials");
  }
  return url;
}

function limited(
  attempt: Exclude<RetrievalAttempt, { kind: "document" }>,
): PublicWebResult {
  return { kind: "limited", reason: attempt.reason };
}

export class PublicWebAdapter {
  readonly declaration = publicWebDeclaration;

  constructor(private readonly retrieval: ResearchRetrievalBoundary) {}

  async retrieve(request: PublicWebRequest): Promise<PublicWebResult> {
    const target = normalizePublicTarget(request.target);

    // Ordinary HTTP is always first. The result, rather than a URL suffix,
    // determines whether the page actually needs specialized handling.
    const http = await this.retrieval.retrieveHttp(target);
    if (http.kind === "limited") return limited(http);

    if (http.kind === "requires_browser") {
      if (request.approveBrowserRendering !== true) {
        return { kind: "limited", reason: "browser_rendering_not_approved" };
      }
      const rendered = await this.retrieval.renderBrowser(new URL(http.url));
      return rendered.kind === "document"
        ? { kind: "success", document: rendered.document, method: "browser" }
        : limited(rendered);
    }

    if (
      http.document.mediaType.toLowerCase().split(";", 1)[0] ===
      "application/pdf"
    ) {
      if (request.permitPdfExtraction !== true) {
        return { kind: "limited", reason: "pdf_extraction_not_permitted" };
      }
      const extracted = await this.retrieval.extractPdf(http.document);
      return extracted.kind === "document"
        ? { kind: "success", document: extracted.document, method: "pdf" }
        : limited(extracted);
    }

    return { kind: "success", document: http.document, method: "http" };
  }
}
