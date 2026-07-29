export const researchDepths = [
  "qualification",
  "work_now",
  "deep_account",
] as const;
export type ResearchDepth = (typeof researchDepths)[number];

export interface ResearchBudget {
  readonly maximumSources: number;
  readonly maximumPages: number;
}

export const RESEARCH_BUDGETS: Readonly<Record<ResearchDepth, ResearchBudget>> =
  Object.freeze({
    qualification: Object.freeze({ maximumSources: 5, maximumPages: 10 }),
    work_now: Object.freeze({ maximumSources: 10, maximumPages: 25 }),
    deep_account: Object.freeze({ maximumSources: 20, maximumPages: 60 }),
  });
