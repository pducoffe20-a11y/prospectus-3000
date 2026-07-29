import type { ReconciliationClaim } from "./normalize-claim.js";

export const independenceReasons = [
  "independent_sources",
  "same_claim",
  "same_source",
  "same_canonical_source",
  "same_original_source",
  "duplicate_content",
  "direct_citation",
  "transitive_citation",
  "circular_citation",
  "shared_original_source",
  "search_snippet_summarizes_page",
] as const;
export type IndependenceReason = (typeof independenceReasons)[number];

export interface SourceRelationship {
  readonly sourceId: string;
  readonly canonicalSourceId?: string;
  readonly originalSourceId?: string;
  readonly citedSourceIds?: readonly string[];
  /** Alias used by retrieval fixtures and adapters. */
  readonly citesSourceIds?: readonly string[];
  readonly isSearchSnippet?: boolean;
  readonly summarizesSourceId?: string;
}

export interface SourceRelationshipContext {
  readonly sources?: readonly SourceRelationship[];
  /** Alias retained for callers that name source ancestry as lineage. */
  readonly lineage?: readonly SourceRelationship[];
}

export interface SourceIndependenceResult {
  readonly independent: boolean;
  readonly reasons: readonly IndependenceReason[];
}

/**
 * Independence is a lineage question, not an authority or confidence score.
 * Unknown lineage is not invented; callers can supply canonical/original source
 * and citation metadata when it was captured during retrieval.
 */
export function assessSourceIndependence(
  left: Readonly<ReconciliationClaim>,
  right: Readonly<ReconciliationClaim>,
  context: SourceRelationshipContext | readonly ReconciliationClaim[] = {},
): SourceIndependenceResult {
  const sources = Array.isArray(context)
    ? deriveRelationships(context)
    : ((context as SourceRelationshipContext).sources ??
      (context as SourceRelationshipContext).lineage ??
      []);
  const leftSource = relationshipFor(left, sources);
  const rightSource = relationshipFor(right, sources);
  const reasons = new Set<IndependenceReason>();

  if (left.id === right.id) reasons.add("same_claim");
  if (
    left.sourceId === right.sourceId ||
    (left.sourceUrl !== null &&
      right.sourceUrl !== null &&
      canonicalUrl(left.sourceUrl) === canonicalUrl(right.sourceUrl))
  )
    reasons.add("same_source");
  if (
    leftSource.canonicalSourceId &&
    leftSource.canonicalSourceId === rightSource.canonicalSourceId
  )
    reasons.add("same_canonical_source");
  if (
    leftSource.originalSourceId &&
    leftSource.originalSourceId === rightSource.originalSourceId
  )
    reasons.add("same_original_source");
  if (left.contentHash === right.contentHash) reasons.add("duplicate_content");

  const leftCitesRight = leftSource.citedSourceIds.includes(right.sourceId);
  const rightCitesLeft = rightSource.citedSourceIds.includes(left.sourceId);
  const leftDependsOnRight = hasCitationPath(
    left.sourceId,
    right.sourceId,
    sources,
  );
  const rightDependsOnLeft = hasCitationPath(
    right.sourceId,
    left.sourceId,
    sources,
  );
  if (leftCitesRight || rightCitesLeft) reasons.add("direct_citation");
  if (
    (leftDependsOnRight && !leftCitesRight) ||
    (rightDependsOnLeft && !rightCitesLeft)
  )
    reasons.add("transitive_citation");
  if (leftDependsOnRight && rightDependsOnLeft)
    reasons.add("circular_citation");
  if (sharedSourceAncestors(left.sourceId, right.sourceId, sources).length > 0)
    reasons.add("shared_original_source");

  if (
    (leftSource.isSearchSnippet &&
      summarizes(leftSource, rightSource, right)) ||
    (rightSource.isSearchSnippet && summarizes(rightSource, leftSource, left))
  )
    reasons.add("search_snippet_summarizes_page");

  if (reasons.size === 0)
    return { independent: true, reasons: ["independent_sources"] };
  return {
    independent: false,
    reasons: [...reasons].sort(),
  };
}

function relationshipFor(
  claim: Readonly<ReconciliationClaim>,
  sources: readonly SourceRelationship[],
): Required<
  Pick<SourceRelationship, "sourceId" | "citedSourceIds" | "isSearchSnippet">
> &
  Omit<SourceRelationship, "sourceId" | "citedSourceIds" | "isSearchSnippet"> {
  const relationship = sources.find(
    (source) => source.sourceId === claim.sourceId,
  );
  return {
    sourceId: claim.sourceId,
    ...(relationship?.canonicalSourceId
      ? { canonicalSourceId: relationship.canonicalSourceId }
      : {}),
    ...(relationship?.originalSourceId
      ? { originalSourceId: relationship.originalSourceId }
      : {}),
    citedSourceIds:
      relationship?.citedSourceIds ?? relationship?.citesSourceIds ?? [],
    isSearchSnippet:
      relationship?.isSearchSnippet ??
      normalizeSourceClass(claim.sourceClass) === "search_snippet",
    ...(relationship?.summarizesSourceId
      ? { summarizesSourceId: relationship.summarizesSourceId }
      : {}),
  };
}

function deriveRelationships(
  claims: readonly ReconciliationClaim[],
): SourceRelationship[] {
  const byClaimId = new Map(claims.map((claim) => [claim.id, claim]));
  return claims.map((claim) => ({
    sourceId: claim.sourceId,
    citedSourceIds: [...claim.corroborates, ...claim.contradicts]
      .map((claimId) => byClaimId.get(claimId)?.sourceId)
      .filter((sourceId): sourceId is string => sourceId !== undefined),
    isSearchSnippet:
      normalizeSourceClass(claim.sourceClass) === "search_snippet",
  }));
}

function hasCitationPath(
  fromSourceId: string,
  toSourceId: string,
  sources: readonly SourceRelationship[],
): boolean {
  const graph = citationGraph(sources);
  const pending = [...(graph.get(fromSourceId) ?? [])];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const current = pending.shift();
    if (!current || visited.has(current)) continue;
    if (current === toSourceId) return true;
    visited.add(current);
    pending.push(...(graph.get(current) ?? []));
  }
  return false;
}

function sharedSourceAncestors(
  leftSourceId: string,
  rightSourceId: string,
  sources: readonly SourceRelationship[],
): string[] {
  const graph = citationGraph(sources);
  const leftAncestors = allAncestors(leftSourceId, graph);
  const rightAncestors = allAncestors(rightSourceId, graph);
  return [...leftAncestors]
    .filter(
      (sourceId) =>
        sourceId !== leftSourceId &&
        sourceId !== rightSourceId &&
        rightAncestors.has(sourceId),
    )
    .sort();
}

function citationGraph(
  sources: readonly SourceRelationship[],
): ReadonlyMap<string, readonly string[]> {
  return new Map(
    sources.map((source) => [
      source.sourceId,
      [
        ...(source.citedSourceIds ?? source.citesSourceIds ?? []),
        ...(source.originalSourceId ? [source.originalSourceId] : []),
      ],
    ]),
  );
}

function allAncestors(
  sourceId: string,
  graph: ReadonlyMap<string, readonly string[]>,
): ReadonlySet<string> {
  const ancestors = new Set<string>();
  const pending = [...(graph.get(sourceId) ?? [])];
  while (pending.length > 0) {
    const current = pending.shift();
    if (!current || ancestors.has(current)) continue;
    ancestors.add(current);
    pending.push(...(graph.get(current) ?? []));
  }
  return ancestors;
}

function summarizes(
  snippet: ReturnType<typeof relationshipFor>,
  page: ReturnType<typeof relationshipFor>,
  pageClaim: Readonly<ReconciliationClaim>,
): boolean {
  return (
    snippet.summarizesSourceId === page.sourceId ||
    snippet.citedSourceIds.includes(page.sourceId) ||
    snippet.canonicalSourceId === page.sourceId ||
    (pageClaim.sourceUrl !== null &&
      snippet.canonicalSourceId === canonicalUrl(pageClaim.sourceUrl))
  );
}

function canonicalUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  url.search = "";
  return url.toString().replace(/\/$/, "");
}

function normalizeSourceClass(value: string): string {
  return value.toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
}
