import type { LookupAddress } from "node:dns";
import { lookup as dnsLookup } from "node:dns/promises";
import { addressesArePublic, validatePublicUrl } from "./policy.js";
import type { RetrievalResult } from "./types.js";

export interface RetrievalOptions {
  fetch?: typeof globalThis.fetch;
  lookup?: (hostname: string) => Promise<LookupAddress[]>;
  maxBytes?: number;
  maxRedirects?: number;
  timeoutMs?: number;
  now?: () => Date;
}

const redirectStatuses = new Set([301, 302, 303, 307, 308]);
const allowedContent =
  /^(text\/(html|plain)|application\/(json|ld\+json))(?:;|$)/i;

async function boundedText(response: Response, maximum: number) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maximum) return undefined;
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maximum) {
      await reader.cancel();
      return undefined;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/**
 * Fetches bounded public content. Every hop is policy checked and DNS checked;
 * callers must continue treating the returned body as untrusted data.
 */
export async function retrievePublicPage(
  requestedUrl: string,
  options: RetrievalOptions = {},
): Promise<RetrievalResult> {
  const fetcher = options.fetch ?? globalThis.fetch;
  const lookup =
    options.lookup ??
    ((hostname: string) => dnsLookup(hostname, { all: true, verbatim: true }));
  const maxBytes = options.maxBytes ?? 1_000_000;
  const maxRedirects = options.maxRedirects ?? 5;
  const redirects: string[] = [];
  let current = requestedUrl;

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const validation = validatePublicUrl(current);
    if (!validation.ok)
      return {
        status: "denied",
        requestedUrl,
        url: current,
        reason: validation.reason,
      };
    const url = validation.url;
    let addresses: LookupAddress[];
    try {
      addresses = await lookup(url.hostname);
    } catch {
      return {
        status: "denied",
        requestedUrl,
        url: url.href,
        reason: "dns_unresolved",
      };
    }
    if (!addressesArePublic(addresses))
      return {
        status: "denied",
        requestedUrl,
        url: url.href,
        reason: "non_public_host",
      };

    let response: Response;
    try {
      response = await fetcher(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
        headers: { accept: "text/html, text/plain, application/json" },
      });
    } catch {
      return {
        status: "failed",
        requestedUrl,
        url: url.href,
        reason: "network_error",
      };
    }
    if (redirectStatuses.has(response.status)) {
      const location = response.headers.get("location");
      if (!location)
        return {
          status: "failed",
          requestedUrl,
          url: url.href,
          reason: "http_error",
          httpStatus: response.status,
        };
      if (hop === maxRedirects)
        return {
          status: "denied",
          requestedUrl,
          url: url.href,
          reason: "redirect_limit",
        };
      redirects.push(url.href);
      current = new URL(location, url).href;
      continue;
    }
    if (!response.ok)
      return {
        status: "failed",
        requestedUrl,
        url: url.href,
        reason: "http_error",
        httpStatus: response.status,
      };
    const contentType =
      response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!allowedContent.test(contentType))
      return {
        status: "denied",
        requestedUrl,
        url: url.href,
        reason: "unsupported_content_type",
      };
    const body = await boundedText(response, maxBytes);
    if (body === undefined)
      return {
        status: "denied",
        requestedUrl,
        url: url.href,
        reason: "response_too_large",
      };
    return {
      status: "retrieved",
      requestedUrl,
      finalUrl: url.href,
      redirects,
      contentType,
      body,
      bytes: new TextEncoder().encode(body).byteLength,
      retrievedAt: (options.now ?? (() => new Date()))().toISOString(),
    };
  }
  return {
    status: "denied",
    requestedUrl,
    url: current,
    reason: "redirect_limit",
  };
}
