export type RetrievalKind = "html" | "pdf";

export interface Clock {
  now(): number;
}

export interface Timer {
  set(callback: () => void, milliseconds: number): unknown;
  clear(handle: unknown): void;
}

export interface PolicyDecision {
  allowed: boolean;
  reason: string;
  robots: "allowed" | "disallowed" | "not-applicable" | "unknown";
  public: boolean;
  pdfAllowed?: boolean;
}

/** Resolves the host and applies both URL and resolved-IP/unsafe-network policy. */
export interface DnsPolicy {
  check(url: URL): Promise<PolicyDecision>;
}

export interface DomainLimits {
  concurrency: number;
  requestsPerSecond: number;
}

export interface DomainLimiter {
  acquire(domain: string, limits: DomainLimits): Promise<() => void>;
}

export interface TransportResponse {
  status: number;
  headers: Readonly<Record<string, string | undefined>>;
  body: AsyncIterable<Uint8Array>;
  metadata?: Readonly<Record<string, unknown>>;
}

export interface HttpTransport {
  request(input: {
    url: URL;
    method: "GET";
    headers: Readonly<Record<string, string>>;
    signal: AbortSignal;
  }): Promise<TransportResponse>;
}

export interface TransportAttempt {
  url: string;
  startedAt: number;
  finishedAt: number;
  status?: number;
  metadata?: Readonly<Record<string, unknown>>;
}

export interface RetrievalRecord {
  requestedUrl: string;
  finalUrl: string;
  kind: RetrievalKind;
  policy: PolicyDecision;
  attempts: TransportAttempt[];
  redirects: number;
}

export type RetrievalResult =
  | (RetrievalRecord & {
      outcome: "success";
      mediaType: string;
      bytes: number;
      body: Uint8Array;
    })
  | (RetrievalRecord & {
      outcome: "limited";
      limit: "body-size";
      maximumBytes: number;
      bytesRead: number;
      mediaType?: string;
    })
  | (RetrievalRecord & {
      outcome: "failed";
      failure:
        | "policy"
        | "permission"
        | "unsafe-destination"
        | "validation"
        | "deadline"
        | "transport";
      message: string;
      status?: number;
      mediaType?: string;
    });

export interface RetrievalDependencies {
  transport: HttpTransport;
  clock: Clock;
  timer: Timer;
  dnsPolicy: DnsPolicy;
  domainLimiter: DomainLimiter;
}

export interface RetrievalOptions {
  userAgent: string;
  domainLimits: DomainLimits;
  deadlineMs?: number;
}
