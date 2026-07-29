export * from "./policy.js";
export * from "./retrieve.js";
export * from "./search.js";
export * from "./types.js";
import { isIP } from "node:net";

export const MAX_RESPONSE_BYTES = 1_000_000;
export const MAX_REDIRECTS = 5;

export interface DnsResolver {
  resolve(hostname: string): Promise<string[]>;
}

export interface TransportResponse {
  status: number;
  headers: Record<string, string | undefined>;
  body: AsyncIterable<Uint8Array>;
}

export interface PublicTransport {
  request(
    url: URL,
    options: { signal: AbortSignal; addresses: string[] },
  ): Promise<TransportResponse>;
}

export type RetrievalErrorCode =
  | "INVALID_URL"
  | "UNSUPPORTED_PROTOCOL"
  | "UNSAFE_TARGET"
  | "TOO_MANY_REDIRECTS"
  | "RESPONSE_TOO_LARGE"
  | "TIMEOUT";

export class RetrievalError extends Error {
  constructor(
    public readonly code: RetrievalErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "RetrievalError";
  }
}

const unsafeV4 = (address: string) => {
  const octets = address.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  )
    return true;
  const [a = 0, b = 0] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19))
  );
};

const unsafeAddress = (address: string) => {
  const normalized = address.toLowerCase().split("%")[0] ?? "";
  if (isIP(normalized) === 4) return unsafeV4(normalized);
  if (isIP(normalized) !== 6) return true;
  if (normalized === "::" || normalized === "::1") return true;
  if (
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized)
  )
    return true;
  const mapped = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  return mapped ? unsafeV4(mapped) : false;
};

const parseTarget = (input: string) => {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new RetrievalError(
      "INVALID_URL",
      "The target is not a valid absolute URL",
    );
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new RetrievalError(
      "UNSUPPORTED_PROTOCOL",
      "Only HTTP(S) retrieval is supported",
    );
  if (url.username || url.password)
    throw new RetrievalError(
      "INVALID_URL",
      "URL credentials are not supported",
    );
  return url;
};

const resolveSafe = async (url: URL, dns: DnsResolver) => {
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost"))
    throw new RetrievalError(
      "UNSAFE_TARGET",
      "Localhost targets are forbidden",
    );
  const addresses = isIP(hostname) ? [hostname] : await dns.resolve(hostname);
  if (addresses.length === 0 || addresses.some(unsafeAddress))
    throw new RetrievalError(
      "UNSAFE_TARGET",
      "The target resolves to a non-public address",
    );
  return addresses;
};

export interface RetrievedDocument {
  url: string;
  contentType: string;
  bytes: Uint8Array;
  text?: string;
}

export async function retrievePublicUrl(
  input: string,
  dependencies: {
    dns: DnsResolver;
    transport: PublicTransport;
    timeoutMs?: number;
    maxBytes?: number;
  },
): Promise<RetrievedDocument> {
  let current = parseTarget(input);
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    dependencies.timeoutMs ?? 10_000,
  );
  try {
    for (let redirects = 0; ; redirects += 1) {
      if (redirects > MAX_REDIRECTS)
        throw new RetrievalError(
          "TOO_MANY_REDIRECTS",
          "Redirect limit exceeded",
        );
      // Resolve on every hop; the transport must connect only to these pinned addresses.
      const addresses = await resolveSafe(current, dependencies.dns);
      let response: TransportResponse;
      try {
        response = await dependencies.transport.request(current, {
          signal: controller.signal,
          addresses,
        });
      } catch (error) {
        if (controller.signal.aborted)
          throw new RetrievalError("TIMEOUT", "Retrieval timed out");
        throw error;
      }
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.location;
        if (!location)
          throw new RetrievalError(
            "INVALID_URL",
            "Redirect response omitted Location",
          );
        current = parseTarget(new URL(location, current).href);
        continue;
      }
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for await (const chunk of response.body) {
          size += chunk.byteLength;
          if (size > (dependencies.maxBytes ?? MAX_RESPONSE_BYTES))
            throw new RetrievalError(
              "RESPONSE_TOO_LARGE",
              "Response exceeded the byte limit",
            );
          chunks.push(chunk);
        }
      } catch (error) {
        if (controller.signal.aborted)
          throw new RetrievalError("TIMEOUT", "Retrieval timed out");
        throw error;
      }
      const bytes = Buffer.concat(chunks);
      const contentType =
        response.headers["content-type"]?.split(";")[0]?.trim().toLowerCase() ??
        "application/octet-stream";
      return {
        url: current.href,
        contentType,
        bytes,
        ...(contentType === "text/html"
          ? { text: sanitizeEvidenceHtml(bytes.toString("utf8")) }
          : {}),
      };
    }
  } finally {
    clearTimeout(timeout);
  }
}

export function sanitizeEvidenceHtml(html: string) {
  return html
    .replace(
      /<(script|style|iframe|object|embed|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
      " ",
    )
    .replace(/<(script|style|iframe|object|embed|template)\b[^>]*\/?>/gi, " ")
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(
      /\s+(?:href|src)\s*=\s*(?:"\s*javascript:[^"]*"|'\s*javascript:[^']*'|javascript:[^\s>]+)/gi,
      "",
    )
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export type SearchResult =
  | { kind: "results"; sources: { title: string; url: string }[] }
  | { kind: "limited-source"; reason: "provider-unconfigured"; sources: [] };

export async function searchPublicSources(
  query: string,
  provider?: {
    search(query: string): Promise<{ title: string; url: string }[]>;
  },
): Promise<SearchResult> {
  if (!provider)
    return {
      kind: "limited-source",
      reason: "provider-unconfigured",
      sources: [],
    };
  return { kind: "results", sources: await provider.search(query) };
}

export type LinkedInAction =
  "authenticate" | "use-cookies" | "scrape-restricted" | "bypass" | "message";

export function assertLinkedInActionAllowed(action: LinkedInAction): never {
  throw new RetrievalError(
    "UNSAFE_TARGET",
    `LinkedIn ${action} is denied; only user-supplied context is permitted`,
  );
}
