import { retrieve } from "./core.js";
import type {
  RetrievalDependencies,
  RetrievalOptions,
  RetrievalResult,
} from "./types.js";

export const MAX_HTML_BYTES = 5 * 1024 * 1024;

export function createHtmlFetcher(
  dependencies: RetrievalDependencies,
  options: RetrievalOptions,
) {
  return (url: string): Promise<RetrievalResult> =>
    retrieve(url, "html", MAX_HTML_BYTES, dependencies, options);
}

export type {
  RetrievalDependencies,
  RetrievalOptions,
  RetrievalResult,
} from "./types.js";
