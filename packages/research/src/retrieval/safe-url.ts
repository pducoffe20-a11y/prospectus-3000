export type SafeUrlValidationCode =
  "malformed-url" | "unsupported-protocol" | "credentials-not-allowed";

export interface SafeUrlValidationFailure {
  readonly ok: false;
  readonly code: SafeUrlValidationCode;
  readonly message: string;
  readonly input: string;
}

export interface SafeUrl {
  readonly href: string;
  readonly protocol: "http:" | "https:";
  readonly hostname: string;
  readonly port: number;
  readonly authority: string;
}

export type SafeUrlValidationResult =
  { readonly ok: true; readonly value: SafeUrl } | SafeUrlValidationFailure;

function failure(
  input: string,
  code: SafeUrlValidationCode,
  message: string,
): SafeUrlValidationFailure {
  return { ok: false, code, message, input };
}

/**
 * Parses and canonicalizes a URL before any network policy is applied.
 *
 * Callers get a discriminated failure instead of parser exceptions. The
 * returned value contains primitives rather than a mutable `URL`, preventing
 * a checked URL from being changed after validation.
 */
export function parseSafeUrl(input: string | URL): SafeUrlValidationResult {
  const raw = input instanceof URL ? input.href : input;
  let parsed: URL;

  try {
    parsed = new URL(raw);
  } catch {
    return failure(raw, "malformed-url", "The value is not an absolute URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return failure(
      raw,
      "unsupported-protocol",
      "Only HTTP and HTTPS URLs are permitted",
    );
  }

  if (parsed.username !== "" || parsed.password !== "") {
    return failure(
      raw,
      "credentials-not-allowed",
      "URLs containing credentials are not permitted",
    );
  }

  // URL performs IDNA conversion, lower-cases DNS names, canonicalizes numeric
  // IPv4 forms, and removes an explicit default port.
  const protocol = parsed.protocol;
  const hostname = parsed.hostname.startsWith("[")
    ? parsed.hostname.slice(1, -1)
    : parsed.hostname;
  const port =
    parsed.port === ""
      ? protocol === "https:"
        ? 443
        : 80
      : Number(parsed.port);

  return {
    ok: true,
    value: Object.freeze({
      href: parsed.href,
      protocol,
      hostname,
      port,
      authority: parsed.host,
    }),
  };
}
