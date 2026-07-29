export interface PublicSearchResult {
  title: string;
  url: string;
  snippet: string;
  publishedAt?: string;
}

export interface PublicSearchAdapter {
  search(query: string, limit?: number): Promise<PublicSearchResult[]>;
}

interface SearxngResult {
  title?: unknown;
  url?: unknown;
  content?: unknown;
  publishedDate?: unknown;
}

const text = (value: unknown, maximum: number) =>
  typeof value === "string" ? value.trim().slice(0, maximum) : "";

export class SearxngPublicSearchAdapter implements PublicSearchAdapter {
  constructor(
    private readonly endpoint: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    const url = new URL(endpoint);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password)
      throw new Error(
        "PUBLIC_SEARCH_BASE_URL must be an HTTP(S) URL without credentials",
      );
  }

  async search(query: string, limit = 10): Promise<PublicSearchResult[]> {
    const normalizedQuery = query.trim().slice(0, 500);
    if (!normalizedQuery) return [];
    const boundedLimit = Math.max(1, Math.min(limit, 20));
    const url = new URL(
      "search",
      this.endpoint.endsWith("/") ? this.endpoint : `${this.endpoint}/`,
    );
    url.searchParams.set("q", normalizedQuery);
    url.searchParams.set("format", "json");
    const response = await this.fetcher(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok)
      throw new Error(`Public search failed with status ${response.status}`);
    const payload = (await response.json()) as { results?: unknown };
    if (!Array.isArray(payload.results)) return [];
    return (payload.results as SearxngResult[])
      .flatMap((result) => {
        const title = text(result.title, 300);
        const rawUrl = text(result.url, 2_048);
        const snippet = text(result.content, 1_000);
        try {
          const parsed = new URL(rawUrl);
          if (
            !/^https?:$/.test(parsed.protocol) ||
            parsed.username ||
            parsed.password
          )
            return [];
          const publishedAt = text(result.publishedDate, 100);
          return [
            {
              title,
              url: parsed.href,
              snippet,
              ...(publishedAt ? { publishedAt } : {}),
            },
          ];
        } catch {
          return [];
        }
      })
      .slice(0, boundedLimit);
  }
}

export function publicSearchFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
  fetcher: typeof fetch = fetch,
): PublicSearchAdapter | undefined {
  const provider = environment.PUBLIC_SEARCH_PROVIDER?.trim().toLowerCase();
  if (!provider) return undefined;
  if (provider !== "searxng")
    throw new Error(`Unsupported public search provider: ${provider}`);
  const endpoint = environment.PUBLIC_SEARCH_BASE_URL?.trim();
  if (!endpoint)
    throw new Error(
      "PUBLIC_SEARCH_BASE_URL is required for the SearXNG provider",
    );
  return new SearxngPublicSearchAdapter(endpoint, fetcher);
}
