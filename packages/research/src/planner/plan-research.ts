import { RESEARCH_BUDGETS, type ResearchDepth } from "./budgets.js";
import { PLANNER_QUESTIONS, type PlannerQuestion } from "./questions.js";

export const scoreDimensions = [
  "fit",
  "urgency",
  "persona",
  "evidence",
] as const;
export type ScoreDimension = (typeof scoreDimensions)[number];
export const retrievalMethods = [
  "public_search",
  "public_html",
  "public_pdf",
] as const;
export type RetrievalMethod = (typeof retrievalMethods)[number];

export interface ResearchTask {
  readonly decisionChangingQuestion: PlannerQuestion;
  readonly targetEntity: {
    readonly id: string;
    readonly kind: "organization" | "contact";
  };
  readonly sourceStrategy: readonly string[];
  readonly affectedScoreDimensions: readonly ScoreDimension[];
  readonly stoppingCondition: string;
  readonly depth: ResearchDepth;
  readonly maximumSources: number;
  readonly maximumPages: number;
  readonly permittedRetrievalMethods: readonly RetrievalMethod[];
  readonly currentKnownEvidence: readonly string[];
  readonly unresolvedGap: string;
}

export interface PlanResearchInput {
  readonly question: PlannerQuestion;
  readonly targetEntity: ResearchTask["targetEntity"];
  readonly depth: ResearchDepth;
  readonly unresolvedGap: string;
  readonly currentKnownEvidence?: readonly string[];
  readonly affectedScoreDimensions: readonly ScoreDimension[];
  readonly sourceStrategy?: readonly string[];
  readonly permittedRetrievalMethods?: readonly RetrievalMethod[];
}

export function planResearch(input: PlanResearchInput): ResearchTask {
  if (!PLANNER_QUESTIONS.includes(input.question))
    throw new Error("Unknown planner question");
  if (!input.unresolvedGap.trim())
    throw new Error("Research requires an explicit unresolved gap");
  if (input.affectedScoreDimensions.length === 0)
    throw new Error("Research must affect a score dimension");
  const budget = RESEARCH_BUDGETS[input.depth];
  return {
    decisionChangingQuestion: input.question,
    targetEntity: input.targetEntity,
    sourceStrategy: input.sourceStrategy ?? [
      "official entity pages",
      "government or regulator sources",
      "reputable primary reporting",
    ],
    affectedScoreDimensions: input.affectedScoreDimensions,
    stoppingCondition:
      "Stop as soon as the decision-changing gap is closed; otherwise return unresolved at a safety or budget boundary.",
    depth: input.depth,
    maximumSources: budget.maximumSources,
    maximumPages: budget.maximumPages,
    permittedRetrievalMethods:
      input.permittedRetrievalMethods ?? retrievalMethods,
    currentKnownEvidence: input.currentKnownEvidence ?? [],
    unresolvedGap: input.unresolvedGap.trim(),
  };
}
