import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  BoardSummaryFileSchema,
  OutreachPreparationPayloadFileSchema,
} from "./board.js";
import { EvidenceClaimSchema } from "./evidence.js";
import { OutreachPayloadSchema } from "./outreach.js";
import { ReasoningStepSchema } from "./reasoning.js";
import { ProspectDecisionSchema, ScorecardSchema } from "./scoring.js";

export const jsonSchemas = {
  evidenceClaim: zodToJsonSchema(EvidenceClaimSchema, "EvidenceClaim"),
  reasoningStep: zodToJsonSchema(ReasoningStepSchema, "ReasoningStep"),
  scorecard: zodToJsonSchema(ScorecardSchema, "Scorecard"),
  prospectDecision: zodToJsonSchema(ProspectDecisionSchema, "ProspectDecision"),
  outreachPayload: zodToJsonSchema(OutreachPayloadSchema, "OutreachPayload"),
  outreachPreparationPayloadFile: zodToJsonSchema(
    OutreachPreparationPayloadFileSchema,
    "OutreachPreparationPayloadFile",
  ),
  boardSummaryFile: zodToJsonSchema(BoardSummaryFileSchema, "BoardSummaryFile"),
} as const;

async function generate(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const output = resolve(here, "../schema");
  await mkdir(output, { recursive: true });
  await Promise.all(
    Object.entries(jsonSchemas).map(([name, schema]) =>
      writeFile(
        resolve(output, `${name}.schema.json`),
        `${JSON.stringify(schema, null, 2)}\n`,
      ),
    ),
  );
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await generate();
