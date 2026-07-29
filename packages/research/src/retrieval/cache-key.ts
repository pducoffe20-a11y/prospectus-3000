import { createHash } from "node:crypto";

export interface RetrievalMetadata {
  readonly retrievedAt?: string;
  readonly statusCode?: number;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface CacheIdentity {
  readonly canonicalUrl: string;
  readonly contentHash: string;
  readonly cacheKey: string;
}

const TRACKING_PARAMETERS = /^(?:utm_.+|fbclid|gclid|dclid|msclkid)$/i;

export function normalizeCanonicalUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError("Only HTTP(S) URLs have retrieval cache identities");
  }
  url.protocol = url.protocol.toLowerCase();
  url.hostname = url.hostname.toLowerCase();
  url.hash = "";
  url.username = "";
  url.password = "";
  if (
    (url.protocol === "http:" && url.port === "80") ||
    (url.protocol === "https:" && url.port === "443")
  )
    url.port = "";

  const parameters = [...url.searchParams.entries()]
    .filter(([name]) => !TRACKING_PARAMETERS.test(name))
    .sort(([leftName, leftValue], [rightName, rightValue]) =>
      leftName === rightName
        ? leftValue.localeCompare(rightValue)
        : leftName.localeCompare(rightName),
    );
  url.search = "";
  for (const [name, parameterValue] of parameters)
    url.searchParams.append(name, parameterValue);
  url.pathname = url.pathname.replace(/\/{2,}/g, "/");
  if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/$/, "");
  return url.href;
}

export function hashContent(content: string | Uint8Array): string {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

/** Retrieval timestamps, headers, and status are intentionally not inputs. */
export function createCacheIdentity(
  url: string,
  content: string | Uint8Array,
): CacheIdentity {
  const canonicalUrl = normalizeCanonicalUrl(url);
  const contentHash = hashContent(content);
  const cacheKey = `retrieval:${createHash("sha256")
    .update(canonicalUrl)
    .update("\0")
    .update(contentHash)
    .digest("hex")}`;
  return { canonicalUrl, contentHash, cacheKey };
}
