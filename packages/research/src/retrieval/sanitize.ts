import { DomUtils, parseDocument } from "htmlparser2";
import type { AnyNode, Element } from "domhandler";

export const SANITIZE_LIMITS = Object.freeze({
  excerptCharacters: 4_000,
  titleCharacters: 200,
  linkCharacters: 300,
  linkCount: 25,
  metadataCharacters: 500,
  metadataCount: 20,
});

export interface UntrustedEvidenceText {
  readonly text: string;
  readonly trust: "untrusted_evidence";
  readonly controlSemantics: false;
}

export interface SafeLink {
  readonly url: string;
  readonly label: UntrustedEvidenceText;
}

export interface SafeMetadata {
  readonly name: string;
  readonly value: UntrustedEvidenceText;
}

export interface SanitizedPage {
  readonly excerpt: UntrustedEvidenceText;
  readonly title?: UntrustedEvidenceText;
  readonly links: readonly SafeLink[];
  readonly metadata: readonly SafeMetadata[];
  readonly truncated: boolean;
}

const BLOCKED_ELEMENTS = new Set([
  "applet",
  "audio",
  "canvas",
  "embed",
  "frame",
  "frameset",
  "iframe",
  "math",
  "noscript",
  "object",
  "script",
  "style",
  "svg",
  "template",
  "video",
]);
const SAFE_METADATA_NAMES = new Set([
  "author",
  "description",
  "og:description",
  "og:site_name",
  "og:title",
  "twitter:description",
  "twitter:title",
]);

const evidence = (text: string): UntrustedEvidenceText => ({
  text,
  trust: "untrusted_evidence",
  controlSemantics: false,
});

function normalizeText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

function bound(value: string, maximum: number): string {
  return Array.from(value).slice(0, maximum).join("");
}

function isElement(node: AnyNode): node is Element {
  return node.type === "tag" || node.type === "script" || node.type === "style";
}

function removeActiveContent(node: AnyNode): void {
  if ("children" in node) {
    node.children = node.children.filter((child) => {
      if (!isElement(child)) return true;
      return !BLOCKED_ELEMENTS.has(child.name.toLowerCase());
    });
    for (const child of node.children) removeActiveContent(child);
  }
  if (isElement(node)) {
    for (const attribute of Object.keys(node.attribs)) {
      if (/^on/i.test(attribute) || attribute.toLowerCase() === "style") {
        delete node.attribs[attribute];
      }
    }
  }
}

function safeUrl(
  value: string | undefined,
  baseUrl?: string,
): string | undefined {
  if (!value) return undefined;
  try {
    const url = baseUrl ? new URL(value, baseUrl) : new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Converts an HTML page to deliberately bounded evidence. Text that resembles
 * commands or prompts remains ordinary untrusted text and is never interpreted.
 */
export function sanitizeExtractedHtml(
  html: string,
  options: { sourceUrl?: string } = {},
): SanitizedPage {
  const document = parseDocument(html, { decodeEntities: true });
  removeActiveContent(document);

  const titleElement = DomUtils.findOne(
    (element) => element.name.toLowerCase() === "title",
    document.children,
  );
  const rawTitle = titleElement
    ? normalizeText(DomUtils.textContent(titleElement))
    : "";

  const body = DomUtils.findOne(
    (element) => element.name.toLowerCase() === "body",
    document.children,
  );
  const rawExcerpt = normalizeText(DomUtils.textContent(body ?? document));
  const excerptText = bound(rawExcerpt, SANITIZE_LIMITS.excerptCharacters);

  const links: SafeLink[] = [];
  const metadata: SafeMetadata[] = [];
  const elements = DomUtils.findAll(() => true, document.children);
  for (const element of elements) {
    const name = element.name.toLowerCase();
    if (name === "a" && links.length < SANITIZE_LIMITS.linkCount) {
      const url = safeUrl(element.attribs.href, options.sourceUrl);
      if (url) {
        links.push({
          url,
          label: evidence(
            bound(
              normalizeText(DomUtils.textContent(element)),
              SANITIZE_LIMITS.linkCharacters,
            ),
          ),
        });
      }
    }
    if (name !== "meta" || metadata.length >= SANITIZE_LIMITS.metadataCount)
      continue;
    const key = normalizeText(
      element.attribs.name ?? element.attribs.property ?? "",
    ).toLowerCase();
    // http-equiv (including refresh redirects) is never retained.
    if (!SAFE_METADATA_NAMES.has(key) || "http-equiv" in element.attribs)
      continue;
    const value = bound(
      normalizeText(element.attribs.content ?? ""),
      SANITIZE_LIMITS.metadataCharacters,
    );
    if (value) metadata.push({ name: key, value: evidence(value) });
  }

  return {
    excerpt: evidence(excerptText),
    ...(rawTitle
      ? {
          title: evidence(bound(rawTitle, SANITIZE_LIMITS.titleCharacters)),
        }
      : {}),
    links,
    metadata,
    truncated:
      Array.from(rawExcerpt).length > SANITIZE_LIMITS.excerptCharacters,
  };
}
