import type {
  PolicyDecision,
  RetrievalDependencies,
  RetrievalKind,
  RetrievalOptions,
  RetrievalResult,
  TransportAttempt,
} from "./types.js";

const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const DEFAULT_DEADLINE_MS = 20_000;

function mediaType(headers: Readonly<Record<string, string | undefined>>) {
  return headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase();
}

function failureForPolicy(
  decision: PolicyDecision,
): "policy" | "permission" | "unsafe-destination" {
  const reason = decision.reason.toLowerCase();
  if (
    reason.includes("private") ||
    reason.includes("loopback") ||
    reason.includes("unsafe")
  )
    return "unsafe-destination";
  if (decision.robots === "disallowed" || reason.includes("permission"))
    return "permission";
  return "policy";
}

function validMedia(
  kind: RetrievalKind,
  value: string | undefined,
): value is string {
  if (kind === "pdf") return value === "application/pdf";
  return value === "text/html" || value === "application/xhtml+xml";
}

function base(
  requestedUrl: string,
  url: URL,
  kind: RetrievalKind,
  policy: PolicyDecision,
  attempts: TransportAttempt[],
  redirects: number,
) {
  return {
    requestedUrl,
    finalUrl: url.href,
    kind,
    policy,
    attempts,
    redirects,
  };
}

export async function retrieve(
  rawUrl: string,
  kind: RetrievalKind,
  maximumBytes: number,
  dependencies: RetrievalDependencies,
  options: RetrievalOptions,
): Promise<RetrievalResult> {
  let url: URL;
  const attempts: TransportAttempt[] = [];
  let redirects = 0;
  let policy: PolicyDecision = {
    allowed: false,
    reason: "URL has not been evaluated",
    robots: "unknown",
    public: false,
  };
  try {
    url = new URL(rawUrl);
  } catch {
    return {
      ...base(
        rawUrl,
        new URL("about:blank"),
        kind,
        policy,
        attempts,
        redirects,
      ),
      outcome: "failed",
      failure: "validation",
      message: "Invalid URL",
    };
  }

  while (true) {
    if (url.protocol !== "http:" && url.protocol !== "https:")
      return {
        ...base(rawUrl, url, kind, policy, attempts, redirects),
        outcome: "failed",
        failure: "validation",
        message: "Only HTTP(S) URLs are supported",
      };

    try {
      policy = await dependencies.dnsPolicy.check(url);
    } catch (error) {
      return {
        ...base(rawUrl, url, kind, policy, attempts, redirects),
        outcome: "failed",
        failure: "policy",
        message: error instanceof Error ? error.message : "Policy check failed",
      };
    }
    if (!policy.allowed)
      return {
        ...base(rawUrl, url, kind, policy, attempts, redirects),
        outcome: "failed",
        failure: failureForPolicy(policy),
        message: policy.reason,
      };
    if (kind === "pdf" && (!policy.public || policy.pdfAllowed !== true))
      return {
        ...base(rawUrl, url, kind, policy, attempts, redirects),
        outcome: "failed",
        failure: "permission",
        message: "PDF extraction is not approved by policy",
      };

    const release = await dependencies.domainLimiter.acquire(
      url.hostname,
      options.domainLimits,
    );
    const controller = new AbortController();
    const startedAt = dependencies.clock.now();
    let deadlineReached = false;
    const timer = dependencies.timer.set(() => {
      deadlineReached = true;
      controller.abort(new Error("Request deadline exceeded"));
    }, options.deadlineMs ?? DEFAULT_DEADLINE_MS);
    try {
      const response = await dependencies.transport.request({
        url,
        method: "GET",
        headers: {
          accept:
            kind === "pdf"
              ? "application/pdf"
              : "text/html, application/xhtml+xml",
          "user-agent": options.userAgent,
        },
        signal: controller.signal,
      });
      attempts.push({
        url: url.href,
        startedAt,
        finishedAt: dependencies.clock.now(),
        status: response.status,
        ...(response.metadata ? { metadata: response.metadata } : {}),
      });
      if (REDIRECTS.has(response.status)) {
        const location = response.headers.location;
        if (!location)
          return {
            ...base(rawUrl, url, kind, policy, attempts, redirects),
            outcome: "failed",
            failure: "validation",
            message: "Redirect response omitted Location",
            status: response.status,
          };
        if (redirects >= 5)
          return {
            ...base(rawUrl, url, kind, policy, attempts, redirects),
            outcome: "failed",
            failure: "validation",
            message: "Maximum redirect count exceeded",
            status: response.status,
          };
        try {
          url = new URL(location, url);
        } catch {
          return {
            ...base(rawUrl, url, kind, policy, attempts, redirects),
            outcome: "failed",
            failure: "validation",
            message: "Redirect Location is invalid",
            status: response.status,
          };
        }
        redirects += 1;
        continue;
      }
      if (response.status === 401 || response.status === 403)
        return {
          ...base(rawUrl, url, kind, policy, attempts, redirects),
          outcome: "failed",
          failure: "permission",
          message: `HTTP ${response.status}`,
          status: response.status,
        };
      if (response.status < 200 || response.status >= 300)
        return {
          ...base(rawUrl, url, kind, policy, attempts, redirects),
          outcome: "failed",
          failure: "transport",
          message: `HTTP ${response.status}`,
          status: response.status,
        };

      const type = mediaType(response.headers);
      if (!validMedia(kind, type))
        return {
          ...base(rawUrl, url, kind, policy, attempts, redirects),
          outcome: "failed",
          failure: "validation",
          message: `Unexpected media type: ${type ?? "missing"}`,
          ...(type ? { mediaType: type } : {}),
        };
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      for await (const chunk of response.body) {
        bytes += chunk.byteLength;
        if (bytes > maximumBytes)
          return {
            ...base(rawUrl, url, kind, policy, attempts, redirects),
            outcome: "limited",
            limit: "body-size",
            maximumBytes,
            bytesRead: bytes,
            mediaType: type,
          };
        chunks.push(chunk);
      }
      const body = new Uint8Array(bytes);
      let offset = 0;
      for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.byteLength;
      }
      if (
        kind === "pdf" &&
        new TextDecoder().decode(body.subarray(0, 5)) !== "%PDF-"
      )
        return {
          ...base(rawUrl, url, kind, policy, attempts, redirects),
          outcome: "failed",
          failure: "validation",
          message: "Response does not contain a PDF signature",
          mediaType: type,
        };
      return {
        ...base(rawUrl, url, kind, policy, attempts, redirects),
        outcome: "success",
        mediaType: type,
        bytes,
        body,
      };
    } catch (error) {
      attempts.push({
        url: url.href,
        startedAt,
        finishedAt: dependencies.clock.now(),
      });
      return {
        ...base(rawUrl, url, kind, policy, attempts, redirects),
        outcome: "failed",
        failure: deadlineReached ? "deadline" : "transport",
        message: deadlineReached
          ? "Request deadline exceeded"
          : error instanceof Error
            ? error.message
            : "Transport failed",
      };
    } finally {
      dependencies.timer.clear(timer);
      release();
    }
  }
}
