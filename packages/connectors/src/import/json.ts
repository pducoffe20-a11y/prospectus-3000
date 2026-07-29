import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { ImportStructureError } from "./errors.js";
import {
  recordCollectionSchema,
  type ImportOptions,
  type ImportResult,
} from "./types.js";

export async function importJson(
  path: string,
  options: ImportOptions,
): Promise<ImportResult> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new ImportStructureError(
      `Malformed JSON in ${basename(path)}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  const result = recordCollectionSchema.safeParse(parsed);
  if (!result.success)
    throw new ImportStructureError(
      `Expected an array or an object with only a records array in ${basename(path)}: ${result.error.issues.map((issue) => issue.message).join("; ")}`,
    );
  const records = Array.isArray(result.data)
    ? result.data
    : result.data.records;
  return {
    rows: records.map((raw, index) => ({
      raw,
      provenance: {
        sourceFilename: basename(path),
        importRunId: options.importRunId,
        rowNumber: index + 1,
      },
      kind: "record" as const,
    })),
    errors: [],
  };
}
