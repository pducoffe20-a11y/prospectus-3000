import type { RawRecord } from "@prospect-cockpit/connectors/import";
import type { NormalizedIdentity, NormalizedProspect } from "./types.js";

const text = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;
export const normalizeOrganization = (value: unknown) =>
  text(value)
    ?.normalize("NFKC")
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(/\b(incorporated|inc|llc|ltd|limited|corp|corporation)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim() || undefined;
export const normalizePersonName = (value: unknown) =>
  text(value)
    ?.normalize("NFKC")
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
export const normalizeTitle = (value: unknown) =>
  text(value)?.normalize("NFKC").toLowerCase().replace(/\s+/g, " ");
export const normalizeEmail = (value: unknown) => {
  const normalized = text(value)?.toLowerCase();
  return normalized && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
    ? normalized
    : undefined;
};
export const normalizeDomain = (value: unknown) => {
  const supplied = text(value)?.toLowerCase();
  if (!supplied) return undefined;
  try {
    return (
      new URL(
        supplied.includes("://") ? supplied : `https://${supplied}`,
      ).hostname
        .replace(/^www\./, "")
        .replace(/\.$/, "") || undefined
    );
  } catch {
    return undefined;
  }
};
export const normalizeLinkedInUrl = (value: unknown) => {
  const supplied = text(value);
  if (!supplied) return undefined;
  try {
    const url = new URL(
      supplied.includes("://") ? supplied : `https://${supplied}`,
    );
    if (!/(^|\.)linkedin\.com$/i.test(url.hostname)) return undefined;
    return `${url.hostname.toLowerCase().replace(/^www\./, "")}${url.pathname.replace(/\/+$/, "").toLowerCase()}`;
  } catch {
    return undefined;
  }
};
export const normalizeDate = (value: unknown) => {
  const supplied = text(value);
  if (!supplied) return undefined;
  let match = /^(\d{4})-(\d{2})-(\d{2})/.exec(supplied);
  if (match)
    return validDate(Number(match[1]), Number(match[2]), Number(match[3]));
  match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(supplied);
  return match
    ? validDate(Number(match[3]), Number(match[1]), Number(match[2]))
    : undefined;
};
function validDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`
    : undefined;
}

export function normalizeProspect(raw: RawRecord): NormalizedProspect {
  const pairs: [keyof NormalizedIdentity, string | undefined][] = [
    ["sourceId", text(raw.sourceId)],
    ["organization", normalizeOrganization(raw.organization)],
    ["domain", normalizeDomain(raw.domain)],
    ["personName", normalizePersonName(raw.personName)],
    ["title", normalizeTitle(raw.title)],
    ["email", normalizeEmail(raw.email)],
    ["linkedinUrl", normalizeLinkedInUrl(raw.linkedinUrl)],
    ["date", normalizeDate(raw.date)],
  ];
  return {
    raw: structuredClone(raw),
    normalized: Object.fromEntries(
      pairs.filter(
        (pair): pair is [keyof NormalizedIdentity, string] =>
          pair[1] !== undefined,
      ),
    ),
  };
}
