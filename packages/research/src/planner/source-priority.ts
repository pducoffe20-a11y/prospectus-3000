export const sourceAuthorities = [
  "official",
  "government",
  "regulator",
  "primary_news",
  "reputable_secondary",
  "aggregator",
  "search_snippet",
] as const;
export type SourceAuthority = (typeof sourceAuthorities)[number];

const PRIORITY: Readonly<Record<SourceAuthority, number>> = Object.freeze({
  official: 0,
  government: 1,
  regulator: 2,
  primary_news: 3,
  reputable_secondary: 4,
  aggregator: 5,
  search_snippet: 6,
});

export interface SourceLead {
  readonly id: string;
  readonly authority: SourceAuthority;
}

/** Stable authority ordering; snippets and aggregators remain discovery leads. */
export function prioritizeSources<T extends SourceLead>(
  sources: readonly T[],
): T[] {
  return sources
    .map((source, index) => ({ source, index }))
    .sort(
      (left, right) =>
        PRIORITY[left.source.authority] - PRIORITY[right.source.authority] ||
        left.index - right.index,
    )
    .map(({ source }) => source);
}
