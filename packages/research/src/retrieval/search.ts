import { validatePublicUrl } from "./policy.js";
import type { SearchOutcome, SearchProvider } from "./types.js";

/** Search absence is an explicit degraded state; it never triggers scraping. */
export async function searchPublicWeb(
  query: string,
  provider?: SearchProvider,
  signal?: AbortSignal,
): Promise<SearchOutcome> {
  if (!provider)
    return { status: "unavailable", results: [], reason: "not_configured" };
  try {
    const results = await provider.search(query, signal);
    if (!Array.isArray(results))
      return { status: "unavailable", results: [], reason: "invalid_response" };
    return {
      status: "available",
      results: results.filter((result) => validatePublicUrl(result.url).ok),
    };
  } catch {
    return { status: "unavailable", results: [], reason: "provider_error" };
  }
}
