import { isIP } from "node:net";

import {
  parseSafeUrl,
  type SafeUrl,
  type SafeUrlValidationFailure,
} from "./safe-url.js";

export type AddressFamily = 4 | 6;

export interface ResolvedAddress {
  readonly address: string;
  readonly family: AddressFamily;
}

/** Resolver seam used by policy code. Tests can return a different answer per call. */
export type DnsResolver = (
  hostname: string,
) => Promise<readonly ResolvedAddress[]>;

export type IpPolicyReason =
  | "invalid-address"
  | "family-mismatch"
  | "unspecified"
  | "loopback"
  | "private"
  | "link-local"
  | "multicast"
  | "reserved"
  | "cloud-metadata";

export interface IpPolicyDecision {
  readonly allowed: boolean;
  readonly address: string;
  readonly family?: AddressFamily;
  readonly reason?: IpPolicyReason;
}

export type TargetValidationFailure =
  | SafeUrlValidationFailure
  | {
      readonly ok: false;
      readonly code: "dns-failure" | "no-addresses" | "unsafe-address";
      readonly message: string;
      readonly hostname: string;
      readonly decision?: IpPolicyDecision;
      readonly cause?: unknown;
    };

export interface ApprovedConnectionTarget {
  readonly url: SafeUrl;
  /** The literal, policy-checked address the transport must dial. */
  readonly address: string;
  readonly family: AddressFamily;
  readonly port: number;
  /** Original host for HTTP Host and TLS SNI; never use it as the dial host. */
  readonly servername: string;
  readonly resolvedAddresses: readonly ResolvedAddress[];
}

export type TargetValidationResult =
  | { readonly ok: true; readonly value: ApprovedConnectionTarget }
  | TargetValidationFailure;

const ipv4 = (
  address: string,
): [number, number, number, number] | undefined => {
  if (isIP(address) !== 4) return undefined;
  const bytes = address.split(".").map(Number);
  return [bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!];
};

function classifyIpv4(address: string): IpPolicyDecision {
  const bytes = ipv4(address);
  if (!bytes) return { allowed: false, address, reason: "invalid-address" };
  const [a, b, c, d] = bytes;
  const blocked = (reason: IpPolicyReason): IpPolicyDecision => ({
    allowed: false,
    address,
    family: 4,
    reason,
  });

  if (a === 0) return blocked("unspecified");
  if (a === 127) return blocked("loopback");
  if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168))
    return blocked("private");
  if (a === 169 && b === 254) {
    return blocked(c === 169 && d === 254 ? "cloud-metadata" : "link-local");
  }
  if (a >= 224 && a <= 239) return blocked("multicast");
  // Non-globally-routable ranges are denied as a secure default. This also
  // covers shared address space and common provider-specific metadata IPs.
  if (
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 240
  )
    return blocked(
      a === 100 && b === 100 && c === 100 && d === 200
        ? "cloud-metadata"
        : "reserved",
    );

  return { allowed: true, address, family: 4 };
}

function parseIpv6(address: string): bigint | undefined {
  const zone = address.indexOf("%");
  if (zone !== -1) address = address.slice(0, zone);
  if (isIP(address) !== 6) return undefined;

  const halves = address.split("::");
  const parseHalf = (half: string): number[] => {
    if (!half) return [];
    const parts = half.split(":");
    const last = parts.at(-1);
    if (last && last.includes(".")) {
      const bytes = ipv4(last);
      if (!bytes) return [];
      parts.splice(
        -1,
        1,
        ((bytes[0] << 8) | bytes[1]).toString(16),
        ((bytes[2] << 8) | bytes[3]).toString(16),
      );
    }
    return parts.map((part) => Number.parseInt(part, 16));
  };
  const left = parseHalf(halves[0]!);
  const right = parseHalf(halves[1] ?? "");
  const groups =
    halves.length === 2
      ? [...left, ...Array(8 - left.length - right.length).fill(0), ...right]
      : left;
  return groups.reduce((value, group) => (value << 16n) | BigInt(group), 0n);
}

function classifyIpv6(address: string): IpPolicyDecision {
  const value = parseIpv6(address);
  if (value === undefined)
    return { allowed: false, address, reason: "invalid-address" };
  const blocked = (reason: IpPolicyReason): IpPolicyDecision => ({
    allowed: false,
    address,
    family: 6,
    reason,
  });

  if (value === 0n) return blocked("unspecified");
  if (value === 1n) return blocked("loopback");
  if (value >> 121n === 0x7en) return blocked("private"); // fc00::/7
  if (value >> 118n === 0x3fan) return blocked("link-local"); // fe80::/10
  if (value >> 120n === 0xffn) return blocked("multicast");

  // IPv4-mapped IPv6 must inherit the embedded address policy.
  if (value >> 32n === 0xffffn) {
    const embedded = Number(value & 0xffffffffn);
    const mapped = [
      embedded >>> 24,
      (embedded >>> 16) & 255,
      (embedded >>> 8) & 255,
      embedded & 255,
    ].join(".");
    const decision = classifyIpv4(mapped);
    if (!decision.allowed) return blocked(decision.reason ?? "reserved");
  }

  return { allowed: true, address, family: 6 };
}

export function classifyIpAddress(address: string): IpPolicyDecision {
  const family = isIP(address);
  if (family === 4) return classifyIpv4(address);
  if (family === 6) return classifyIpv6(address);

  // The URL parser recognizes legacy integer/octal/hex IPv4 spellings and
  // produces a canonical dotted decimal address for policy classification.
  try {
    const canonical = new URL(`http://${address}`).hostname;
    if (isIP(canonical) === 4) return classifyIpv4(canonical);
  } catch {
    // Report the typed invalid decision below.
  }
  return { allowed: false, address, reason: "invalid-address" };
}

export async function approveConnectionTarget(
  input: string | URL | SafeUrl,
  resolve: DnsResolver,
): Promise<TargetValidationResult> {
  // Parse again even when a SafeUrl is supplied. Besides keeping this boundary
  // self-contained, that prevents a structurally forged object from bypassing
  // URL validation at runtime.
  const parsed = parseSafeUrl(
    typeof input === "string" || input instanceof URL ? input : input.href,
  );
  if (!parsed.ok) return parsed;

  let addresses: readonly ResolvedAddress[];
  try {
    addresses = await resolve(parsed.value.hostname);
  } catch (cause) {
    return {
      ok: false,
      code: "dns-failure",
      message: "DNS resolution failed",
      hostname: parsed.value.hostname,
      cause,
    };
  }
  if (addresses.length === 0)
    return {
      ok: false,
      code: "no-addresses",
      message: "DNS returned no addresses",
      hostname: parsed.value.hostname,
    };

  for (const resolved of addresses) {
    const decision = classifyIpAddress(resolved.address);
    if (decision.family !== undefined && decision.family !== resolved.family) {
      return {
        ok: false,
        code: "unsafe-address",
        message: "DNS address family did not match the address",
        hostname: parsed.value.hostname,
        decision: { ...decision, allowed: false, reason: "family-mismatch" },
      };
    }
    if (!decision.allowed)
      return {
        ok: false,
        code: "unsafe-address",
        message: `DNS returned a disallowed address (${decision.reason})`,
        hostname: parsed.value.hostname,
        decision,
      };
  }

  const pinned = addresses[0]!;
  const checkedAddresses = addresses.map((resolved) =>
    Object.freeze({ ...resolved }),
  );
  return {
    ok: true,
    value: Object.freeze({
      url: parsed.value,
      address: pinned.address,
      family: pinned.family,
      port: parsed.value.port,
      servername: parsed.value.hostname,
      resolvedAddresses: Object.freeze(checkedAddresses),
    }),
  };
}

/** Resolve a redirect relative to the prior URL and run the complete policy anew. */
export async function approveRedirectTarget(
  location: string,
  previous: ApprovedConnectionTarget,
  resolve: DnsResolver,
): Promise<TargetValidationResult> {
  let redirect: URL;
  try {
    redirect = new URL(location, previous.url.href);
  } catch {
    return {
      ok: false,
      code: "malformed-url",
      message: "The redirect location is not a valid URL",
      input: location,
    };
  }
  return approveConnectionTarget(redirect, resolve);
}
