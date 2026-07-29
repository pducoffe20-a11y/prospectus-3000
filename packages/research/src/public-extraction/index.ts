export type ExtractionMode = "static" | "difficult-page";
export interface PublicExtractionRequest {
  url: string;
  mode: ExtractionMode;
  maxCharacters?: number;
}
export interface PublicExtractionResponse {
  url: string;
  title: string;
  content: string;
  contentType: string;
  fetchedAt: string;
  extractor: "crawl4ai" | "scrapling";
  truncated: boolean;
}

/** Scrapling is deliberately not selectable: only the worker may choose it after
 * Crawl4AI fails for a request already classified as a difficult page. */
export async function extractPublicPage(
  endpoint: string,
  request: PublicExtractionRequest,
  fetcher: typeof fetch = fetch,
): Promise<PublicExtractionResponse> {
  const response = await fetcher(
    new URL("v1/extract", endpoint.endsWith("/") ? endpoint : `${endpoint}/`),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(35_000),
    },
  );
  if (!response.ok)
    throw new Error(`Public extraction failed with status ${response.status}`);
  return response.json() as Promise<PublicExtractionResponse>;
}
