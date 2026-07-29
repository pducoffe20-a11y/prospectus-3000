import { query, type TransactionContext } from "./transaction.js";
export interface DecisionArtifactInput {
  prospectId: string;
  scorecardId: string;
  status: "work_now" | "light_research" | "suppress";
  confidence: number;
  rationale: string;
  smallestNextResearchStep: string | null;
}
/** Multi-artifact writes accept only a branded active transaction. */
export async function appendDecision(
  transaction: TransactionContext,
  input: DecisionArtifactInput,
): Promise<string> {
  const result = await query<{ id: string }>(
    transaction,
    `INSERT INTO prospect_decisions (prospect_id,scorecard_id,status,confidence,rationale,smallest_next_research_step) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [
      input.prospectId,
      input.scorecardId,
      input.status,
      input.confidence,
      input.rationale,
      input.smallestNextResearchStep,
    ],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Decision insert returned no id");
  return row.id;
}
