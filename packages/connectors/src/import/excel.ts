import { basename } from "node:path";
import ExcelJS from "exceljs";
import type { CellValue } from "exceljs";
import type {
  ImportOptions,
  ImportResult,
  RawRecord,
  RawValue,
} from "./types.js";

function displayedValue(value: CellValue, text: string): RawValue {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return text;
  return value;
}

export async function importExcel(
  path: string,
  options: ImportOptions,
): Promise<ImportResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path, {
    ignoreNodes: ["dataValidations", "extLst"],
  });
  const requested = options.sheetNames;
  const sheets = requested
    ? requested
        .map((name) => workbook.getWorksheet(name))
        .filter((sheet): sheet is ExcelJS.Worksheet => Boolean(sheet))
    : workbook.worksheets.filter((sheet) => sheet.state === "visible");
  const missing =
    requested?.filter((name) => !workbook.getWorksheet(name)) ?? [];
  if (missing.length)
    throw new Error(`Requested worksheets not found: ${missing.join(", ")}`);
  const result: ImportResult = { rows: [], errors: [] };
  for (const sheet of sheets) {
    const headerRow = sheet.getRow(1);
    const originals: string[] = [];
    for (let column = 1; column <= sheet.columnCount; column += 1)
      originals.push(headerRow.getCell(column).text || `column_${column}`);
    const counts = new Map<string, number>();
    const headers = originals.map((header) => {
      const count = (counts.get(header) ?? 0) + 1;
      counts.set(header, count);
      return count === 1 ? header : `${header}#${count}`;
    });
    const duplicates = originals.filter(
      (header, index) => originals.indexOf(header) !== index,
    );
    if (duplicates.length)
      result.errors.push({
        code: "AMBIGUOUS_HEADER",
        message: `Duplicate headers mapped with numeric suffixes: ${[...new Set(duplicates)].join(", ")}`,
        rowNumber: 1,
        sheetName: sheet.name,
        fields: [...new Set(duplicates)],
      });
    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      const raw: RawRecord = {};
      headers.forEach((header, index) => {
        const cell = row.getCell(index + 1);
        raw[header] = displayedValue(cell.value, cell.text);
      });
      result.rows.push({
        raw,
        provenance: {
          sourceFilename: basename(path),
          workbookName: basename(path),
          sheetName: sheet.name,
          importRunId: options.importRunId,
          rowNumber,
        },
        kind: "record",
      });
    }
  }
  return result;
}
