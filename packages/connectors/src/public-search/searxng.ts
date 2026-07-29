import type {
  PublicSearchHit,
  PublicSearchProvider,
  PublicSearchQuery,
} from "./types.js";

export interface SearXNGConfig {
  baseUrl: string;
  /** Optional headers allow deployment-specific authentication without coupling the interface to it. */
  headers?: Readonly<Record<string, string>>;
  fetch?: typeof globalThis.fetch;
}

interface SearXNGResponse {
  results?: unknown;
}

function parseHit(value: unknown): PublicSearchHit | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.url !== "string" || typeof record.title !== "string")
    return undefined;
  const url = new URL(record.url);
  if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
  return {
    url: url.href,
    title: record.title,
    snippet: typeof record.content === "string" ? record.content : "",
  };
}

export class SearXNGSearchProvider implements PublicSearchProvider {
  private readonly baseUrl: URL;
  private readonly fetchImplementation: typeof globalThis.fetch;

  constructor(private readonly config: SearXNGConfig) {
    this.baseUrl = new URL(config.baseUrl);
    if (
      this.baseUrl.protocol !== "http:" &&
      this.baseUrl.protocol !== "https:"
    ) {
      throw new TypeError("SearXNG baseUrl must use HTTP or HTTPS");
    }
    this.fetchImplementation = config.fetch ?? globalThis.fetch;
  }

  async search(query: PublicSearchQuery): Promise<readonly PublicSearchHit[]> {
    const endpoint = new URL(
      "search",
      this.baseUrl.href.endsWith("/") ? this.baseUrl : `${this.baseUrl.href}/`,
    );
    endpoint.searchParams.set("q", query.query);
    endpoint.searchParams.set("format", "json");

    const response = await this.fetchImplementation(endpoint, {
      method: "GET",
      headers: { accept: "application/json", ...this.config.headers },
    });
    if (!response.ok)
      throw new Error(`SearXNG request failed with status ${response.status}`);
    const payload = (await response.json()) as SearXNGResponse;
    if (!Array.isArray(payload.results))
      throw new Error("SearXNG returned an invalid response");

    const limit = Math.max(0, Math.min(query.limit ?? 10, 100));
    return payload.results
      .flatMap((result) => {
        try {
          const hit = parseHit(result);
          return hit === undefined ? [] : [hit];
        } catch {
          return [];
        }
      })
      .slice(0, limit);
  }
}
