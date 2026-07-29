import { createReadStream } from "node:fs";
import { basename } from "node:path";
import { parse } from "csv-parse";
import type { ImportOptions, ImportResult, RawRecord } from "./types.js";

const uniqueHeaders = (headers: string[]) => {
  const counts = new Map<string, number>();
  return headers.map((header, index) => {
    const base = header || `column_${index + 1}`;
    const count = (counts.get(base) ?? 0) + 1;
    counts.set(base, count);
    return count === 1 ? base : `${base}#${count}`;
  });
};

export async function importCsv(
  path: string,
  options: ImportOptions,
): Promise<ImportResult> {
  const rows: ImportResult["rows"] = [];
  const errors: ImportResult["errors"] = [];
  let originalHeaders: string[] | undefined;
  let headers: string[] = [];
  let rowNumber = 0;
  const parser = createReadStream(path).pipe(
    parse({ bom: true, relax_column_count: true, skip_empty_lines: false }),
  );
  for await (const value of parser) {
    rowNumber += 1;
    const cells = (value as unknown[]).map((cell) => String(cell ?? ""));
    if (!originalHeaders) {
      originalHeaders = cells;
      headers = uniqueHeaders(cells);
      const duplicates = cells.filter(
        (header, index) => header && cells.indexOf(header) !== index,
      );
      if (duplicates.length)
        errors.push({
          code: "AMBIGUOUS_HEADER",
          message: `Duplicate headers mapped with numeric suffixes: ${[...new Set(duplicates)].join(", ")}`,
          rowNumber,
          fields: [...new Set(duplicates)],
        });
      continue;
    }
    const repeated =
      cells.length === originalHeaders.length &&
      cells.every((cell, index) => cell === originalHeaders?.[index]);
    const raw: RawRecord = {};
    const width = Math.max(headers.length, cells.length);
    for (let index = 0; index < width; index += 1)
      raw[headers[index] ?? `column_${index + 1}`] = cells[index] ?? "";
    rows.push({
      raw,
      provenance: {
        sourceFilename: basename(path),
        importRunId: options.importRunId,
        rowNumber,
      },
      kind: repeated ? "repeated-header" : "record",
    });
    if (repeated)
      errors.push({
        code: "REPEATED_HEADER",
        message:
          "Row repeats the file header and was preserved but marked as non-record data",
        rowNumber,
      });
    if (cells.length !== headers.length)
      errors.push({
        code: "ROW_SHAPE",
        message: `Expected ${headers.length} columns but received ${cells.length}; missing cells were preserved as blanks and extra cells received generated names`,
        rowNumber,
      });
  }
  return { rows, errors };
}
