import { retrieve } from "./core.js";
import type {
  RetrievalDependencies,
  RetrievalOptions,
  RetrievalResult,
} from "./types.js";

export const MAX_PDF_BYTES = 20 * 1024 * 1024;

export function createPdfFetcher(
  dependencies: RetrievalDependencies,
  options: RetrievalOptions,
) {
  return (url: string): Promise<RetrievalResult> =>
    retrieve(url, "pdf", MAX_PDF_BYTES, dependencies, options);
}

export type {
  RetrievalDependencies,
  RetrievalOptions,
  RetrievalResult,
} from "./types.js";
