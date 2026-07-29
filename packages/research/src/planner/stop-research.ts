import type { ResearchTask } from "./plan-research.js";

export const stopReasons = [
  "gap_closed",
  "poor_fit",
  "source_boundary",
  "budget_unlikely_to_change_decision",
  "budget_exhausted",
] as const;
export type StopReason = (typeof stopReasons)[number];
export type ResearchDisposition =
  | { readonly action: "continue" }
  | {
      readonly action: "stop";
      readonly reason: StopReason;
      readonly resolved: boolean;
      readonly unresolvedGap?: string;
    };

export interface ResearchProgress {
  readonly sourcesUsed: number;
  readonly pagesUsed: number;
  readonly gapClosed?: boolean;
  readonly clearlyPoorFit?: boolean;
  readonly sourceBoundaryBlocked?: boolean;
  readonly remainingBudgetLikelyToChangeDecision?: boolean;
}

export function stopResearch(
  task: ResearchTask,
  progress: ResearchProgress,
): ResearchDisposition {
  if (progress.gapClosed)
    return { action: "stop", reason: "gap_closed", resolved: true };
  if (progress.clearlyPoorFit)
    return { action: "stop", reason: "poor_fit", resolved: true };
  if (progress.sourceBoundaryBlocked)
    return unresolved(task, "source_boundary");
  const exhausted =
    progress.sourcesUsed >= task.maximumSources ||
    progress.pagesUsed >= task.maximumPages;
  if (exhausted) return unresolved(task, "budget_exhausted");
  if (progress.remainingBudgetLikelyToChangeDecision === false)
    return unresolved(task, "budget_unlikely_to_change_decision");
  return { action: "continue" };
}

function unresolved(
  task: ResearchTask,
  reason: StopReason,
): ResearchDisposition {
  return {
    action: "stop",
    reason,
    resolved: false,
    unresolvedGap: task.unresolvedGap,
  };
}
