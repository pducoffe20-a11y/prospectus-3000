import { isIP } from "node:net";
import type { LookupAddress } from "node:dns";
import type { RetrievalDenialReason } from "./types.js";

const LINKEDIN_HOST = /(^|\.)linkedin\.com$/i;
const NON_PUBLIC_NAMES = /(^|\.)(localhost|local|internal|home|lan)$/i;

const ipv4Number = (address: string) =>
  address
    .split(".")
    .reduce((value, octet) => (value << 8) + Number(octet), 0) >>> 0;

const inV4Range = (address: string, base: string, bits: number) => {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipv4Number(address) & mask) === (ipv4Number(base) & mask);
};

/** Reject every non-globally-routable IPv4 range relevant to server-side fetches. */
const isNonPublicV4 = (address: string) =>
  [
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.0.2.0", 24],
    ["192.168.0.0", 16],
    ["198.18.0.0", 15],
    ["198.51.100.0", 24],
    ["203.0.113.0", 24],
    ["224.0.0.0", 4],
    ["240.0.0.0", 4],
  ].some(([base, bits]) => inV4Range(address, base as string, bits as number));

export const isPublicAddress = (address: string): boolean => {
  const version = isIP(address);
  if (version === 4) return !isNonPublicV4(address);
  if (version !== 6) return false;
  const value = address.toLowerCase().split("%")[0] ?? "";
  if (value.startsWith("::ffff:")) {
    const mapped = value.slice(7);
    return isIP(mapped) === 4 && !isNonPublicV4(mapped);
  }
  return !(
    value === "::" ||
    value === "::1" ||
    value.startsWith("fc") ||
    value.startsWith("fd") ||
    /^fe[89ab]/.test(value) ||
    value.startsWith("ff") ||
    value.startsWith("2001:db8:")
  );
};

export function validatePublicUrl(
  value: string,
): { ok: true; url: URL } | { ok: false; reason: RetrievalDenialReason } {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    return { ok: false, reason: "unsupported_protocol" };
  if (url.username || url.password)
    return { ok: false, reason: "credentials_not_allowed" };
  const hostname = url.hostname.replace(/\.$/, "").toLowerCase();
  if (LINKEDIN_HOST.test(hostname))
    return { ok: false, reason: "linkedin_not_retrievable" };
  if (!hostname || NON_PUBLIC_NAMES.test(hostname))
    return { ok: false, reason: "non_public_host" };
  if (isIP(hostname) && !isPublicAddress(hostname))
    return { ok: false, reason: "non_public_host" };
  url.hostname = hostname;
  url.hash = "";
  return { ok: true, url };
}

export const addressesArePublic = (addresses: readonly LookupAddress[]) =>
  addresses.length > 0 &&
  addresses.every(({ address }) => isPublicAddress(address));
