/**
 * The reconciliation boundary intentionally accepts the evidence contract
 * structurally. This keeps research independent of the contracts package while
 * allowing a readonly EvidenceClaim to be passed without adaptation.
 */
export interface ReconciliationClaim {
  readonly id: string;
  readonly accountId: string;
  readonly contactId: string | null;
  readonly claimType: string;
  readonly claimText: string;
  readonly sourceId: string;
  readonly sourceClass: string;
  readonly sourceUrl: string | null;
  readonly sourceTitle: string;
  readonly publishedAt: string | null;
  readonly retrievedAt: string;
  readonly supportingExcerpt: string;
  readonly contentHash: string;
  readonly freshness: string;
  readonly confidence: number;
  readonly corroborates: readonly string[];
  readonly contradicts: readonly string[];
}

export const conflictTypes = [
  "current_role_title",
  "tenure_start_date",
  "organization_identity",
  "learning_platform",
  "initiative_timing",
  "program_status",
  "ownership_or_duplicate_seller_motion",
] as const;
export type ConflictType = (typeof conflictTypes)[number];

const CLAIM_TYPE_ALIASES: Readonly<Record<string, ConflictType>> = {
  contact_role: "current_role_title",
  current_role: "current_role_title",
  current_role_title: "current_role_title",
  title: "current_role_title",
  new_role_tenure: "tenure_start_date",
  tenure: "tenure_start_date",
  tenure_start_date: "tenure_start_date",
  start_date: "tenure_start_date",
  organization_fit: "organization_identity",
  organization: "organization_identity",
  organization_identity: "organization_identity",
  learning_platform: "learning_platform",
  platform: "learning_platform",
  use_case: "learning_platform",
  initiative_timing: "initiative_timing",
  timing: "initiative_timing",
  why_now: "initiative_timing",
  current_initiative: "program_status",
  program_status: "program_status",
  ownership: "ownership_or_duplicate_seller_motion",
  ownership_risk: "ownership_or_duplicate_seller_motion",
  duplicate_seller_motion: "ownership_or_duplicate_seller_motion",
  ownership_or_duplicate_seller_motion: "ownership_or_duplicate_seller_motion",
};

export interface NormalizedClaim<
  T extends ReconciliationClaim = ReconciliationClaim,
> {
  /** Exact input claim, retained for source wording and provenance inspection. */
  readonly original: Readonly<T>;
  readonly normalized: {
    readonly claimType: string;
    readonly conflictType: ConflictType | null;
    readonly value: string;
    readonly subjectKey: string | null;
  };
  readonly provenance: {
    readonly claimId: string;
    readonly sourceId: string;
    readonly sourceClass: string;
    readonly sourceUrl: string | null;
    readonly sourceTitle: string;
    readonly supportingExcerpt: string;
    readonly publishedAt: string | null;
    readonly retrievedAt: string;
    readonly contentHash: string;
  };
}

/**
 * Produces a comparison key while retaining the exact claim and all attributable
 * source fields. The key is deliberately conservative: it does not paraphrase
 * unknown terms or infer facts absent from the claim.
 */
export function normalizeClaim<T extends ReconciliationClaim>(
  claim: Readonly<T>,
): NormalizedClaim<T> {
  const claimType = normalizeToken(claim.claimType).replaceAll(" ", "_");
  const conflictType = CLAIM_TYPE_ALIASES[claimType] ?? null;
  return {
    original: claim,
    normalized: {
      claimType,
      conflictType,
      value: normalizeComparableValue(claim.claimText, conflictType),
      subjectKey:
        conflictType === "program_status"
          ? normalizeProgramSubject(claim.claimText)
          : conflictType === "initiative_timing"
            ? normalizeInitiativeSubject(claim.claimText)
            : null,
    },
    provenance: {
      claimId: claim.id,
      sourceId: claim.sourceId,
      sourceClass: claim.sourceClass,
      sourceUrl: claim.sourceUrl,
      sourceTitle: claim.sourceTitle,
      supportingExcerpt: claim.supportingExcerpt,
      publishedAt: claim.publishedAt,
      retrievedAt: claim.retrievedAt,
      contentHash: claim.contentHash,
    },
  };
}

function normalizeProgramSubject(value: string): string {
  return normalizeToken(value)
    .replace(/^the\s+/, "")
    .replace(
      /\s+\b(?:is|are|was|were|remains?|has been)\b\s+(?:currently\s+)?(?:accepting applications|active|paused|suspended|cancelled|canceled|closed|complete|completed|in progress|open|on hold)\b.*$/,
      "",
    )
    .trim();
}

function normalizeInitiativeSubject(value: string): string {
  return normalizeToken(value)
    .replace(
      /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\b/g,
      "",
    )
    .replace(/\b\d{4}(?:-\d{2}(?:-\d{2})?)?\b/g, "")
    .replace(
      /\b(?:enrollment|registration|applications?|opens?|begins?|starts?|launch(?:es|ed)?|deadline|new|the|a|an|for|in|on)\b/g,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeComparableValue(
  value: string,
  type: ConflictType | null,
): string {
  const normalized = normalizeToken(value);
  switch (type) {
    case "current_role_title":
      return normalizeRoleAssertion(
        normalized
          .replace(/\bsvp\b/g, "senior vice president")
          .replace(/\bevp\b/g, "executive vice president")
          .replace(/\bvp\b/g, "vice president")
          .replace(/\bcto\b/g, "chief technology officer")
          .replace(/\bcio\b/g, "chief information officer")
          .replace(/\bceo\b/g, "chief executive officer")
          .replace(/\bcoo\b/g, "chief operating officer")
          .replace(/\s+/g, " ")
          .trim(),
      );
    case "tenure_start_date":
      return normalizeDateExpression(normalized);
    case "initiative_timing":
      return `${timingEvent(normalized)}|${normalizeDateExpression(normalized)}`;
    case "organization_identity":
      return normalized
        .replace(
          /\b(?:incorporated|inc|limited|ltd|llc|corp|corporation)\b/g,
          "",
        )
        .replace(/\s+/g, " ")
        .trim();
    case "learning_platform":
      return normalizePlatformAssertion(
        normalized
          .replace(/\bd2l\s+brightspace\b/g, "brightspace")
          .replace(/\bblackboard\s+learn\b/g, "blackboard")
          .replace(/\bcanvas\s+lms\b/g, "canvas")
          .trim(),
      );
    default:
      return normalized;
  }
}

function timingEvent(value: string): string {
  if (/\blaunch(?:es|ed)?\b/.test(value)) return "launch";
  if (
    /\b(?:enrollment|registration|applications?)\b.*\b(?:open|opens|begin|begins|start|starts)\b/.test(
      value,
    )
  )
    return "enrollment_open";
  if (/\bdeadline\b/.test(value)) return "deadline";
  if (/\b(?:begin|begins|start|starts)\b/.test(value)) return "start";
  return "timing";
}

function normalizeRoleAssertion(value: string): string {
  const titlePattern =
    /\b(?:chief(?: [a-z]+){1,4} officer|(?:senior |executive )?vice president(?: of [a-z ]+)?|director(?: of [a-z ]+)?|president)\b/;
  const titleMatch = value.match(titlePattern);
  if (!titleMatch || titleMatch.index === undefined) return value;
  const title = titleMatch[0].trim();

  const leadingPerson = value.match(
    /^([a-z]+(?: [a-z]+){1,3}) (?:serves as|is|was|became|has been (?:named|appointed))\b/,
  )?.[1];
  if (leadingPerson) return `${leadingPerson} ${title}`;

  const prefixPerson = value
    .slice(0, titleMatch.index)
    .replace(
      /\b(?:serves as|is|was|became|has been (?:named|appointed))\s*$/,
      "",
    )
    .trim();
  if (/^[a-z]+(?: [a-z]+){1,3}$/.test(prefixPerson))
    return `${prefixPerson} ${title}`;

  const titleAtStart = value.match(
    new RegExp(
      `^${escapeRegExp(title)} ([a-z]+(?: [a-z]+){1,3}?)(?: (?:presented|joined|leads|said|announced|spoke|will|is|was))\\b`,
    ),
  )?.[1];
  return titleAtStart ? `${titleAtStart} ${title}` : title;
}

function normalizePlatformAssertion(value: string): string {
  const platform = value.match(
    /\b(brightspace|canvas|blackboard|moodle|cornerstone|saba|successfactors|docebo|absorb)\b/,
  )?.[1];
  return platform ?? value;
}

function normalizeDateExpression(value: string): string {
  const isoDate = value.match(/\b(\d{4})-(\d{2})(?:-(\d{2}))?\b/);
  if (isoDate) {
    const [, year, month, day] = isoDate;
    return day ? `${year}-${month}-${day}` : `${year}-${month}`;
  }
  const monthYear = value.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})\b/,
  );
  if (!monthYear) return value;
  const month = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ].indexOf(monthYear[1] ?? "");
  return `${monthYear[2]}-${String(month + 1).padStart(2, "0")}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeToken(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/&/g, " and ")
    .replace(/[’']/g, "")
    .replace(/[^\p{L}\p{N}-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
