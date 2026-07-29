import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  assessSourceIndependence,
  conflictTypes,
  corroborateClaims,
  detectConflicts,
  normalizeClaim,
} from "@prospect-cockpit/research/reconciliation";
import {
  buildTrace,
  explainChange,
  validateTrace,
} from "@prospect-cockpit/reasoning";
import type {
  EvidenceClaim,
  ReasoningStep,
} from "../../packages/contracts/src/index.js";

interface CompactClaim {
  readonly id: string;
  readonly claimType: string;
  readonly claimText: string;
  readonly sourceId: string;
  readonly sourceClass: string;
  readonly sourceUrl: string | null;
  readonly sourceTitle: string;
  readonly publishedAt: string | null;
  readonly contentHash: string;
  readonly confidence: number;
  readonly freshness?: EvidenceClaim["freshness"];
  readonly state?: EvidenceClaim["state"];
  readonly corroborates?: readonly string[];
  readonly contradicts?: readonly string[];
}

interface SourceContext {
  readonly lineage: readonly {
    readonly sourceId: string;
    readonly citesSourceIds?: readonly string[];
    readonly summarizesSourceId?: string;
  }[];
}

const fixture = async <T>(name: string): Promise<T> =>
  JSON.parse(
    await readFile(`tests/fixtures/conflicts/${name}.json`, "utf8"),
  ) as T;

function evidence(
  input: CompactClaim,
  researchRunId = "run-fixture",
): EvidenceClaim {
  return {
    id: input.id,
    accountId: "account-1",
    contactId: "contact-1",
    claimType: input.claimType,
    claimText: input.claimText,
    state: input.state ?? "publicly_verified",
    sourceId: input.sourceId,
    sourceClass: input.sourceClass,
    sourceUrl: input.sourceUrl,
    sourceTitle: input.sourceTitle,
    publishedAt: input.publishedAt,
    retrievedAt: "2026-07-29T12:00:00Z",
    supportingExcerpt: input.claimText,
    contentHash: input.contentHash,
    freshness: input.freshness ?? "fresh",
    confidence: input.confidence,
    corroborates: [...(input.corroborates ?? [])],
    contradicts: [...(input.contradicts ?? [])],
    affectsScores: ["evidence"],
    outreachPermission: "allowed",
    researchRunId,
  };
}

function issueCodes(trace: ReturnType<typeof buildTrace>): string[] {
  return validateTrace(trace).issues.map(({ code }) => code);
}

test("normalizes comparable values without erasing language or provenance", async () => {
  const data = await fixture<{
    claims: CompactClaim[];
    expected: { normalizedValue: string };
  }>("independent-official-corroboration");
  const claim = evidence(data.claims[0]!);
  const normalized = normalizeClaim(claim);

  assert.equal(normalized.normalized.value, data.expected.normalizedValue);
  assert.equal(normalized.original, claim);
  assert.equal(normalized.original.claimText, data.claims[0]!.claimText);
  assert.deepEqual(normalized.provenance, {
    claimId: claim.id,
    sourceId: claim.sourceId,
    sourceClass: claim.sourceClass,
    sourceUrl: claim.sourceUrl,
    sourceTitle: claim.sourceTitle,
    supportingExcerpt: claim.supportingExcerpt,
    publishedAt: claim.publishedAt,
    retrievedAt: claim.retrievedAt,
    contentHash: claim.contentHash,
  });
});

test("two genuinely independent official sources corroborate", async () => {
  const data = await fixture<{
    claims: CompactClaim[];
    sourceContext: SourceContext;
    expected: {
      independent: boolean;
      corroboratingPairs: string[][];
    };
  }>("independent-official-corroboration");
  const claims = data.claims.map((claim) => evidence(claim));

  assert.equal(
    assessSourceIndependence(claims[0]!, claims[1]!, data.sourceContext)
      .independent,
    data.expected.independent,
  );
  const result = corroborateClaims(claims, data.sourceContext);
  assert.deepEqual(
    result.relationships.map(({ claimIds }) => [...claimIds]),
    data.expected.corroboratingPairs,
  );
  assert.deepEqual(result.claims[0]!.corroborates, [result.claims[1]!.id]);
  assert.deepEqual(result.claims[1]!.corroborates, [result.claims[0]!.id]);

  const aliasResult = corroborateClaims(
    [claims[0]!, { ...claims[1]!, claimType: "title" }],
    data.sourceContext,
  );
  assert.equal(aliasResult.relationships.length, 1);
});

test("circular secondary reporting does not raise corroboration", async () => {
  const data = await fixture<{
    claims: CompactClaim[];
    sourceContext: SourceContext;
    expected: { corroboratingPairs: string[][] };
  }>("circular-secondary-reporting");
  const claims = data.claims.map((claim) => evidence(claim));

  for (let left = 0; left < claims.length; left += 1)
    for (let right = left + 1; right < claims.length; right += 1)
      assert.equal(
        assessSourceIndependence(
          claims[left]!,
          claims[right]!,
          data.sourceContext,
        ).independent,
        false,
      );
  assert.deepEqual(
    corroborateClaims(claims, data.sourceContext).relationships,
    data.expected.corroboratingPairs,
  );
});

test("transitive citation chains and a shared original do not corroborate", () => {
  const claims = [
    evidence({
      id: "claim-report-a",
      claimType: "program_status",
      claimText: "The leadership certificate is active.",
      sourceId: "source-a",
      sourceClass: "reputable_secondary",
      sourceUrl: "https://a.example/report",
      sourceTitle: "Report A",
      publishedAt: "2026-07-03T00:00:00Z",
      contentHash: "hash-a",
      confidence: 0.7,
    }),
    evidence({
      id: "claim-report-b",
      claimType: "program_status",
      claimText: "The leadership certificate is active.",
      sourceId: "source-b",
      sourceClass: "reputable_secondary",
      sourceUrl: "https://b.example/report",
      sourceTitle: "Report B",
      publishedAt: "2026-07-02T00:00:00Z",
      contentHash: "hash-b",
      confidence: 0.7,
    }),
    evidence({
      id: "claim-original",
      claimType: "program_status",
      claimText: "The leadership certificate is active.",
      sourceId: "source-original",
      sourceClass: "official",
      sourceUrl: "https://official.example/status",
      sourceTitle: "Official Status",
      publishedAt: "2026-07-01T00:00:00Z",
      contentHash: "hash-original",
      confidence: 0.9,
    }),
  ];
  const sourceContext = {
    lineage: [
      { sourceId: "source-a", citesSourceIds: ["source-b"] },
      { sourceId: "source-b", citesSourceIds: ["source-original"] },
      { sourceId: "source-original" },
    ],
  };

  const independence = assessSourceIndependence(
    claims[0]!,
    claims[2]!,
    sourceContext,
  );
  assert.equal(independence.independent, false);
  assert.ok(independence.reasons.includes("transitive_citation"));
  assert.deepEqual(corroborateClaims(claims, sourceContext).relationships, []);
});

test("a search snippet cannot corroborate the page it summarizes", async () => {
  const data = await fixture<{
    claims: CompactClaim[];
    sourceContext: SourceContext;
    expected: { independent: boolean; corroboratingPairs: string[][] };
  }>("search-snippet-page");
  const claims = data.claims.map((claim) => evidence(claim));

  assert.equal(
    assessSourceIndependence(claims[0]!, claims[1]!, data.sourceContext)
      .independent,
    data.expected.independent,
  );
  assert.deepEqual(
    corroborateClaims(claims, data.sourceContext).relationships,
    data.expected.corroboratingPairs,
  );
});

test("newer high-authority evidence supersedes stale evidence only through an explicit audited resolution", async () => {
  const data = await fixture<{
    claims: CompactClaim[];
    expected: {
      conflictType: (typeof conflictTypes)[number];
      resolution: {
        kind: "superseded";
        winnerClaimId: string;
        supersededClaimIds: string[];
      };
    };
  }>("stale-official-newer-announcement");
  const claims = data.claims.map((claim) => evidence(claim));

  const unresolved = detectConflicts(claims);
  assert.equal(unresolved[0]!.status, "unresolved");
  assert.equal(unresolved[0]!.resolution, null);

  const resolved = detectConflicts(claims, {
    resolutions: [
      {
        type: data.expected.conflictType,
        accountId: "account-1",
        contactId: "contact-1",
        winnerClaimId: data.expected.resolution.winnerClaimId,
        supersededClaimIds: data.expected.resolution.supersededClaimIds,
        reason:
          "A current official appointment announcement supersedes the stale profile.",
        resolvedAt: "2026-07-29T12:30:00Z",
        resolvedBy: "research-reconciliation",
      },
    ],
  });
  assert.equal(resolved[0]!.status, "resolved");
  assert.equal(resolved[0]!.resolution?.kind, "superseded");
  assert.equal(
    resolved[0]!.resolution?.winnerClaimId,
    data.expected.resolution.winnerClaimId,
  );
  assert.deepEqual(
    resolved[0]!.resolution?.supersededClaimIds,
    data.expected.resolution.supersededClaimIds,
  );
  assert.match(resolved[0]!.resolution?.reason ?? "", /official/i);
  assert.equal(resolved[0]!.resolution?.resolvedBy, "research-reconciliation");
  const trace = buildTrace({
    id: "trace-audited-resolution",
    researchRunId: "run-audited-resolution",
    generatedAt: "2026-07-29T12:30:00Z",
    facts: claims,
    reconciliation: { conflicts: resolved },
    steps: [],
  });
  assert.equal(trace.reconciliation.conflicts[0]!.status, "resolved");
  assert.equal(
    trace.reconciliation.conflicts[0]!.resolution?.resolvedBy,
    "research-reconciliation",
  );
  assert.equal(validateTrace(trace).valid, true);
  assert.throws(
    () =>
      detectConflicts(
        claims.map((claim) =>
          claim.id === data.expected.resolution.winnerClaimId
            ? {
                ...claim,
                sourceClass: "unofficial_blog",
                sourceTitle: "Official Announcement Recap",
              }
            : claim,
        ),
        {
          resolutions: [
            {
              type: data.expected.conflictType,
              accountId: "account-1",
              contactId: "contact-1",
              winnerClaimId: data.expected.resolution.winnerClaimId,
              supersededClaimIds: data.expected.resolution.supersededClaimIds,
              reason: "A recap cannot establish authority.",
              resolvedAt: "2026-07-29T12:30:00Z",
              resolvedBy: "research-reconciliation",
            },
          ],
        },
      ),
    /high authority/,
  );
});

test("detects every required conflict type and preserves both sides", async () => {
  const requiredTypes = [
    "current_role_title",
    "tenure_start_date",
    "organization_identity",
    "learning_platform",
    "initiative_timing",
    "program_status",
    "ownership_or_duplicate_seller_motion",
  ] as const;
  assert.deepEqual(conflictTypes, requiredTypes);

  for (const name of [
    "title-conflict",
    "platform-conflict",
    "timing-conflict",
    "ambiguous-organization-match",
  ]) {
    const data = await fixture<{
      claims: CompactClaim[];
      expected: {
        type: (typeof conflictTypes)[number];
        status: "unresolved";
        claimIds: string[];
      };
    }>(name);
    const conflict = detectConflicts(
      data.claims.map((claim) => evidence(claim)),
    );
    assert.equal(conflict.length, 1, name);
    assert.equal(conflict[0]!.type, data.expected.type, name);
    assert.equal(conflict[0]!.status, data.expected.status, name);
    assert.deepEqual(conflict[0]!.claimIds, data.expected.claimIds, name);
    assert.equal(conflict[0]!.values.length, 2, name);
    assert.equal(conflict[0]!.resolution, null, name);
  }

  const remaining = await fixture<{
    scenarios: {
      type: (typeof conflictTypes)[number];
      claims: CompactClaim[];
    }[];
  }>("remaining-conflict-taxonomy");
  for (const scenario of remaining.scenarios) {
    const conflict = detectConflicts(
      scenario.claims.map((claim) => evidence(claim)),
    );
    assert.equal(conflict.length, 1, scenario.type);
    assert.equal(conflict[0]!.type, scenario.type);
    assert.equal(conflict[0]!.status, "unresolved");
    assert.equal(conflict[0]!.values.length, 2);
  }
});

test("different programs at one account do not create a program-status conflict", () => {
  const claims = [
    evidence({
      id: "claim-alpha-active",
      claimType: "program_status",
      claimText: "Program Alpha is active.",
      sourceId: "source-alpha",
      sourceClass: "official",
      sourceUrl: "https://example.org/alpha",
      sourceTitle: "Program Alpha",
      publishedAt: "2026-07-01T00:00:00Z",
      contentHash: "hash-alpha",
      confidence: 0.9,
    }),
    evidence({
      id: "claim-beta-paused",
      claimType: "program_status",
      claimText: "Program Beta is paused.",
      sourceId: "source-beta",
      sourceClass: "official",
      sourceUrl: "https://example.org/beta",
      sourceTitle: "Program Beta",
      publishedAt: "2026-07-01T00:00:00Z",
      contentHash: "hash-beta",
      confidence: 0.9,
    }),
  ];

  assert.deepEqual(detectConflicts(claims), []);
});

test("a resolution is matched to its exact subject and claim set", () => {
  const claims = [
    ["alpha", "active", "2022-01-01T00:00:00Z", "stale"],
    ["alpha", "paused", "2026-07-01T00:00:00Z", "fresh"],
    ["beta", "active", "2022-01-01T00:00:00Z", "stale"],
    ["beta", "paused", "2026-07-01T00:00:00Z", "fresh"],
  ].map(([program, status, publishedAt, freshness]) =>
    evidence({
      id: `claim-${program}-${status}`,
      claimType: "program_status",
      claimText: `Program ${program} is ${status}.`,
      sourceId: `source-${program}-${status}`,
      sourceClass: freshness === "fresh" ? "official_announcement" : "official",
      sourceUrl: `https://example.org/${program}/${status}`,
      sourceTitle: `Program ${program} status`,
      publishedAt: publishedAt!,
      contentHash: `hash-${program}-${status}`,
      confidence: 0.9,
      freshness: freshness as EvidenceClaim["freshness"],
    }),
  );
  const conflicts = detectConflicts(claims, {
    resolutions: [
      {
        type: "program_status",
        accountId: "account-1",
        contactId: "contact-1",
        winnerClaimId: "claim-beta-paused",
        supersededClaimIds: ["claim-beta-active"],
        reason: "A current official status supersedes the stale page.",
        resolvedAt: "2026-07-29T12:30:00Z",
        resolvedBy: "research-reconciliation",
      },
    ],
  });

  assert.equal(conflicts.length, 2);
  assert.equal(
    conflicts.find(({ claimIds }) => claimIds.includes("claim-alpha-active"))
      ?.status,
    "unresolved",
  );
  assert.equal(
    conflicts.find(({ claimIds }) => claimIds.includes("claim-beta-active"))
      ?.status,
    "resolved",
  );
});

test("initiative reconciliation keeps event and program identity distinct", () => {
  const launch = evidence({
    id: "claim-alpha-launch",
    claimType: "initiative_timing",
    claimText: "Program Alpha launches in October 2026.",
    sourceId: "source-alpha-launch",
    sourceClass: "official",
    sourceUrl: "https://example.org/alpha/launch",
    sourceTitle: "Program Alpha Launch",
    publishedAt: "2026-07-01T00:00:00Z",
    contentHash: "hash-alpha-launch",
    confidence: 0.9,
  });
  const enrollment = evidence({
    id: "claim-alpha-enrollment",
    claimType: "initiative_timing",
    claimText: "Program Alpha enrollment opens in October 2026.",
    sourceId: "source-alpha-enrollment",
    sourceClass: "official",
    sourceUrl: "https://example.org/alpha/enrollment",
    sourceTitle: "Program Alpha Enrollment",
    publishedAt: "2026-07-01T00:00:00Z",
    contentHash: "hash-alpha-enrollment",
    confidence: 0.9,
  });
  const betaLaunch = evidence({
    id: "claim-beta-launch",
    claimType: "initiative_timing",
    claimText: "Program Beta launches in January 2027.",
    sourceId: "source-beta-launch",
    sourceClass: "official",
    sourceUrl: "https://example.org/beta/launch",
    sourceTitle: "Program Beta Launch",
    publishedAt: "2026-07-01T00:00:00Z",
    contentHash: "hash-beta-launch",
    confidence: 0.9,
  });

  assert.deepEqual(
    corroborateClaims([launch, enrollment], { lineage: [] }).relationships,
    [],
  );
  assert.deepEqual(detectConflicts([launch, betaLaunch]), []);
});

test("reconciliation replay is deterministic regardless of input ordering", async () => {
  const corroboration = await fixture<{
    claims: CompactClaim[];
    sourceContext: SourceContext;
  }>("independent-official-corroboration");
  const claims = corroboration.claims.map((claim) => evidence(claim));
  assert.deepEqual(
    corroborateClaims(claims, corroboration.sourceContext),
    corroborateClaims([...claims].reverse(), corroboration.sourceContext),
  );

  const conflict = await fixture<{ claims: CompactClaim[] }>("title-conflict");
  const conflictClaims = conflict.claims.map((claim) => evidence(claim));
  assert.deepEqual(
    detectConflicts(conflictClaims),
    detectConflicts([...conflictClaims].reverse()),
  );
});

test("rejects a prospect-specific interpretation with neither evidence nor a labeled assumption", async () => {
  const data = await fixture<{
    facts: CompactClaim[];
    steps: ReasoningStep[];
    expectedIssueCodes: string[];
  }>("no-evidence-interpretation");
  const trace = buildTrace({
    id: "trace-unsupported",
    researchRunId: "run-unsupported",
    generatedAt: "2026-07-29T12:00:00Z",
    facts: data.facts.map((claim) => evidence(claim)),
    steps: data.steps,
  });

  assert.equal(validateTrace(trace).valid, false);
  for (const code of data.expectedIssueCodes)
    assert.ok(issueCodes(trace).includes(code));
});

test("rejects an action that does not trace to a decision", async () => {
  const data = await fixture<{
    facts: CompactClaim[];
    steps: ReasoningStep[];
    expectedIssueCodes: string[];
  }>("action-with-no-decision");
  const trace = buildTrace({
    id: "trace-action-without-decision",
    researchRunId: "run-action-without-decision",
    generatedAt: "2026-07-29T12:00:00Z",
    facts: data.facts.map((claim) => evidence(claim)),
    steps: data.steps,
  });

  assert.equal(validateTrace(trace).valid, false);
  for (const code of data.expectedIssueCodes)
    assert.ok(issueCodes(trace).includes(code));
});

test("keeps an unresolved conflict visible through the full reasoning chain", async () => {
  const data = await fixture<{
    facts: CompactClaim[];
    steps: ReasoningStep[];
    expected: { valid: boolean; conflictClaimIds: string[] };
  }>("unresolved-conflict-visible");
  const trace = buildTrace({
    id: "trace-visible-conflict",
    researchRunId: "run-visible-conflict",
    generatedAt: "2026-07-29T12:00:00Z",
    facts: data.facts.map((claim) => evidence(claim)),
    reconciliation: {
      conflicts: [
        {
          id: "conflict-current-role",
          type: "current_role_title",
          subjectKey: null,
          claimIds: data.expected.conflictClaimIds,
          status: "unresolved",
          resolution: null,
        },
      ],
    },
    steps: data.steps,
  });

  assert.equal(validateTrace(trace).valid, data.expected.valid);
  assert.deepEqual(
    trace.steps.map(({ type }) => type),
    [
      "signal",
      "interpretation",
      "commercial_meaning",
      "decision",
      "action",
      "expected_outcome",
    ],
  );
  const decision = trace.steps.find(({ type }) => type === "decision")!;
  assert.deepEqual(decision.evidenceClaimIds, data.expected.conflictClaimIds);
  assert.notEqual(decision.validationQuestion, null);
  assert.equal(trace.steps.at(-1)!.epistemicStatus, "hypothesis");
  assert.deepEqual(
    trace.reconciliation.conflicts[0]!.claimIds,
    data.expected.conflictClaimIds,
  );

  const invalidResolution = buildTrace({
    id: "trace-invalid-resolution",
    researchRunId: "run-invalid-resolution",
    generatedAt: "2026-07-29T12:00:00Z",
    facts: data.facts.map((claim) => evidence(claim)),
    reconciliation: {
      conflicts: [
        {
          id: "conflict-invalid",
          type: "current_role_title",
          subjectKey: null,
          claimIds: ["missing-claim", ...data.expected.conflictClaimIds],
          status: "resolved",
          resolution: null,
        },
      ],
    },
    steps: data.steps,
  });
  assert.ok(
    issueCodes(invalidResolution).includes("unknown_reconciliation_evidence"),
  );
  assert.ok(issueCodes(invalidResolution).includes("invalid_resolution"));

  const resolvedTrace = buildTrace({
    id: "trace-resolved-conflict",
    researchRunId: "run-resolved-conflict",
    generatedAt: "2026-07-30T12:00:00Z",
    facts: data.facts.map((claim) =>
      evidence(
        claim.id === "claim-title-director"
          ? { ...claim, freshness: "stale" }
          : claim,
      ),
    ),
    reconciliation: {
      conflicts: [
        {
          id: "conflict-current-role",
          type: "current_role_title",
          subjectKey: null,
          claimIds: data.expected.conflictClaimIds,
          status: "resolved",
          resolution: {
            winnerClaimId: "claim-title-vp",
            supersededClaimIds: ["claim-title-director"],
            reason: "A current official announcement supersedes a stale page.",
            resolvedAt: "2026-07-30T11:00:00Z",
            resolvedBy: "research-reconciliation",
            policyVersion: "evidence-resolution/v1",
            audit: {
              winnerFreshness: "fresh",
              winnerAuthority: "official",
              supersededFreshness: ["stale"],
              supersededAuthorities: ["official"],
            },
          },
        },
      ],
    },
    steps: data.steps,
  });
  assert.equal(validateTrace(resolvedTrace).valid, true);
  const resolutionChange = explainChange(trace, resolvedTrace);
  assert.deepEqual(
    resolutionChange.reconciliation.changed.map(({ conflictId }) => conflictId),
    ["conflict-current-role"],
  );
  assert.match(
    resolutionChange.reconciliation.changed[0]!.reasons.join(" "),
    /status changed|resolution audit changed/,
  );
});

test("rejects a decision that hides a material conflict and a guaranteed outcome", async () => {
  const data = await fixture<{
    facts: CompactClaim[];
    steps: ReasoningStep[];
  }>("unresolved-conflict-visible");
  const hiddenSteps = data.steps.map((step) =>
    step.type === "decision"
      ? {
          ...step,
          evidenceClaimIds: ["claim-title-vp"],
          counterEvidenceClaimIds: [],
          validationQuestion: "Which learning platform does the account use?",
        }
      : step.type === "expected_outcome"
        ? {
            ...step,
            statement: "This will definitely identify the decision maker.",
            confidence: 1,
          }
        : step,
  );
  const trace = buildTrace({
    id: "trace-hidden-conflict",
    researchRunId: "run-hidden-conflict",
    generatedAt: "2026-07-29T12:00:00Z",
    facts: data.facts.map((claim) => evidence(claim)),
    steps: hiddenSteps,
  });

  assert.equal(validateTrace(trace).valid, false);
  assert.ok(issueCodes(trace).includes("hidden_material_conflict"));
  assert.ok(issueCodes(trace).includes("guaranteed_expected_outcome"));

  const assertiveOutcome = buildTrace({
    id: "trace-assertive-outcome",
    researchRunId: "run-assertive-outcome",
    generatedAt: "2026-07-29T12:00:00Z",
    facts: data.facts.map((claim) => evidence(claim)),
    steps: data.steps.map((step) =>
      step.type === "expected_outcome"
        ? {
            ...step,
            statement: "The outreach will increase conversion by 20 percent.",
            confidence: 0.75,
          }
        : step,
    ),
  });
  assert.ok(
    issueCodes(assertiveOutcome).includes("guaranteed_expected_outcome"),
  );
});

test("reasoning trace replay is deterministic and returns an immutable artifact", async () => {
  const data = await fixture<{
    facts: CompactClaim[];
    steps: ReasoningStep[];
  }>("unresolved-conflict-visible");
  const input = {
    id: "trace-deterministic",
    researchRunId: "run-deterministic",
    generatedAt: "2026-07-29T12:00:00Z",
    facts: data.facts.map((claim) => evidence(claim)),
    steps: data.steps,
  };
  const first = buildTrace(input);
  const second = buildTrace(input);
  const permuted = buildTrace({
    ...input,
    facts: [...input.facts].reverse().map((fact) => ({
      ...fact,
      corroborates: [...fact.corroborates].reverse(),
      contradicts: [...fact.contradicts].reverse(),
      affectsScores: [...fact.affectsScores].reverse(),
    })),
    steps: input.steps.map((step) => ({
      ...step,
      evidenceClaimIds: [...step.evidenceClaimIds].reverse(),
      counterEvidenceClaimIds: [...step.counterEvidenceClaimIds].reverse(),
    })),
  });

  assert.deepEqual(first, second);
  assert.deepEqual(first, permuted);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.facts), true);
  assert.equal(Object.isFrozen(first.steps), true);
  assert.equal(Object.isFrozen(first.steps[0]), true);
});

test("explains changed evidence and reasoning without mutating either historical run", async () => {
  const data = await fixture<{
    previous: {
      id: string;
      createdAt: string;
      facts: CompactClaim[];
      steps: ReasoningStep[];
    };
    current: {
      id: string;
      createdAt: string;
      facts: CompactClaim[];
      steps: ReasoningStep[];
    };
    expected: {
      addedEvidenceClaimIds: string[];
      removedEvidenceClaimIds: string[];
      staleEvidenceClaimIds: string[];
      conflictedEvidenceClaimIds: string[];
      newlyVerifiedEvidenceClaimIds: string[];
      changedReasoningStepIds: string[];
    };
  }>("changed-since-last-run");
  const previous = buildTrace({
    id: "trace-previous",
    researchRunId: data.previous.id,
    generatedAt: data.previous.createdAt,
    facts: data.previous.facts.map((claim) =>
      evidence(claim, data.previous.id),
    ),
    steps: data.previous.steps,
  });
  const current = buildTrace({
    id: "trace-current",
    researchRunId: data.current.id,
    generatedAt: data.current.createdAt,
    facts: data.current.facts.map((claim) => evidence(claim, data.current.id)),
    steps: data.current.steps,
  });
  const previousSnapshot = JSON.stringify(previous);
  const currentSnapshot = JSON.stringify(current);

  const explanation = explainChange(previous, current);

  assert.deepEqual(
    explanation.evidence.added,
    data.expected.addedEvidenceClaimIds,
  );
  assert.deepEqual(
    explanation.evidence.removed,
    data.expected.removedEvidenceClaimIds,
  );
  assert.deepEqual(
    explanation.evidence.stale,
    data.expected.staleEvidenceClaimIds,
  );
  assert.deepEqual(
    explanation.evidence.conflicted,
    data.expected.conflictedEvidenceClaimIds,
  );
  assert.deepEqual(
    explanation.evidence.newlyVerified,
    data.expected.newlyVerifiedEvidenceClaimIds,
  );
  assert.deepEqual(
    explanation.evidence.changed.map(({ claimId }) => claimId),
    ["claim-platform-unverified", "claim-role-old"],
  );
  assert.ok(
    explanation.evidence.changed
      .find(({ claimId }) => claimId === "claim-platform-unverified")!
      .reasons.includes("source content changed"),
  );
  assert.deepEqual(
    explanation.reasoning.changed.map(({ stepId }) => stepId),
    data.expected.changedReasoningStepIds,
  );
  assert.ok(explanation.reasoning.changed[0]!.reasons.length > 0);
  assert.equal(JSON.stringify(previous), previousSnapshot);
  assert.equal(JSON.stringify(current), currentSnapshot);
});
