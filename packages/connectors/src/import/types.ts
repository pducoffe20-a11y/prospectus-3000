import { z } from "zod";

export type RawValue =
  string | number | boolean | null | RawValue[] | { [key: string]: RawValue };
export type RawRecord = Record<string, RawValue>;

export interface ImportProvenance {
  sourceFilename: string;
  importRunId: string;
  rowNumber: number;
  sheetName?: string;
  workbookName?: string;
}

export interface ImportedRow {
  raw: RawRecord;
  provenance: ImportProvenance;
  kind: "record" | "repeated-header";
}

export interface ImportValidationError {
  code: "AMBIGUOUS_HEADER" | "REPEATED_HEADER" | "ROW_SHAPE" | "INVALID_RECORD";
  message: string;
  rowNumber?: number;
  sheetName?: string;
  fields?: string[];
}

export interface ImportResult {
  rows: ImportedRow[];
  errors: ImportValidationError[];
}

export interface ImportOptions {
  importRunId: string;
  /** Excel sheet names to import. Omit to import all visible worksheets in workbook order. */
  sheetNames?: string[];
}

const jsonScalarSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);
export const jsonValueSchema: z.ZodType<RawValue> = z.lazy(() =>
  z.union([
    jsonScalarSchema,
    z.array(jsonValueSchema),
    z.record(jsonValueSchema),
  ]),
);
export const rawRecordSchema = z.record(jsonValueSchema);
export const recordCollectionSchema = z.union([
  z.array(rawRecordSchema),
  z.object({ records: z.array(rawRecordSchema) }).strict(),
]);
