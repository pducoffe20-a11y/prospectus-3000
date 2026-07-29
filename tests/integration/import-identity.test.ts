import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ExcelJS from "exceljs";
import {
  importCsv,
  importExcel,
  importJson,
  sanitizeExportCell,
} from "../../packages/connectors/src/import/index.js";
import {
  dedupeProspects,
  normalizeProspect,
} from "../../packages/research/src/identity/index.js";
const fixture = (name: string) => `tests/fixtures/imports/${name}`;

interface WorkbookFixture {
  sheets: { name: string; rows: (string | number | boolean | null)[][] }[];
}

async function materializeWorkbook(name: string, directory: string) {
  const definition = JSON.parse(
    await readFile(fixture(name), "utf8"),
  ) as WorkbookFixture;
  const workbook = new ExcelJS.Workbook();
  for (const definitionSheet of definition.sheets) {
    const sheet = workbook.addWorksheet(definitionSheet.name);
    for (const row of definitionSheet.rows) sheet.addRow(row);
  }
  const output = join(directory, name.replace(/\.json$/, ".xlsx"));
  await workbook.xlsx.writeFile(output);
  return output;
}

test("CSV parser prevents the production break that loses quoted newlines, BOMs, and provenance", async () => {
  const result = await importCsv(fixture("quoted-multiline.csv"), {
    importRunId: "run-1",
  });
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0]?.raw.notes, "first line\nsecond line");
  assert.deepEqual(result.rows[0]?.provenance, {
    sourceFilename: "quoted-multiline.csv",
    importRunId: "run-1",
    rowNumber: 2,
  });
});

test("CSV parser prevents repeated headers from becoming prospects and reports them", async () => {
  const result = await importCsv(fixture("repeated-header.csv"), {
    importRunId: "run-2",
  });
  assert.equal(result.rows.length, 3);
  assert.equal(result.rows[2]?.raw.email, "");
  assert.equal(result.rows[1]?.kind, "repeated-header");
  assert.equal(result.errors[0]?.code, "REPEATED_HEADER");
  assert.equal(result.errors[0]?.rowNumber, 3);
});

test("strict JSON prevents undocumented shapes from being silently coerced", async () => {
  const valid = await importJson(fixture("valid.json"), {
    importRunId: "run-json",
  });
  assert.equal(valid.rows.length, 2);
  assert.equal(valid.rows[0]?.raw.email, null);
  assert.deepEqual(valid.rows[1]?.raw.contacts, []);
  await assert.rejects(
    importJson(fixture("malformed.json"), { importRunId: "bad" }),
    /Expected an array or an object with only a records array/,
  );
});

test("Excel import prevents sheet loss and exposes ambiguous headers", async () => {
  const directory = await mkdtemp(join(tmpdir(), "prospect-import-"));
  try {
    const cleanPath = await materializeWorkbook(
      "clean-workbook.json",
      directory,
    );
    const clean = await importExcel(cleanPath, { importRunId: "run-xlsx" });
    assert.deepEqual(
      clean.rows.map((row) => row.provenance.sheetName),
      ["Accounts", "Contacts"],
    );
    const ambiguousPath = await materializeWorkbook(
      "ambiguous-workbook.json",
      directory,
    );
    const ambiguous = await importExcel(ambiguousPath, {
      importRunId: "run-amb",
    });
    assert.equal(ambiguous.errors[0]?.code, "AMBIGUOUS_HEADER");
    assert.equal(ambiguous.rows[0]?.raw["email#2"], "other@acme.com");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("normalization prevents source mutation and does not invent absent identity fields", () => {
  const normalized = normalizeProspect({
    organization: "  Acme, Inc. ",
    personName: " JANE   DOE ",
    email: " JANE@Example.COM ",
    domain: "https://WWW.Acme.com/path",
    linkedinUrl: "https://www.linkedin.com/in/Jane-Doe/?trk=x",
    date: "01/03/2025",
  });
  assert.equal(normalized.raw.organization, "  Acme, Inc. ");
  assert.deepEqual(normalized.normalized, {
    organization: "acme",
    personName: "jane doe",
    email: "jane@example.com",
    domain: "acme.com",
    linkedinUrl: "linkedin.com/in/jane-doe",
    date: "2025-01-03",
  });
  assert.equal("title" in normalized.normalized, false);
});

test("dedupe prevents silent ambiguous merges and applies deterministic precedence", () => {
  const records = [
    {
      recordId: "1",
      raw: { sourceId: "SAME", organization: "One" },
      normalized: { sourceId: "SAME", organization: "one" },
      provenance: [{ sourceFilename: "a", importRunId: "r", rowNumber: 2 }],
    },
    {
      recordId: "2",
      raw: { sourceId: "SAME", organization: "Two" },
      normalized: { sourceId: "SAME", organization: "two" },
      provenance: [{ sourceFilename: "b", importRunId: "r", rowNumber: 2 }],
    },
    {
      recordId: "3",
      raw: {
        organization: "Acme",
        personName: "Jane Doe",
        email: "JANE@acme.com",
      },
      normalized: {
        organization: "acme",
        personName: "jane doe",
        email: "jane@acme.com",
      },
      provenance: [{ sourceFilename: "c", importRunId: "r", rowNumber: 2 }],
    },
    {
      recordId: "4",
      raw: {
        organization: "Acme Inc",
        personName: "Jane Doe",
        email: "jane@acme.com",
      },
      normalized: {
        organization: "acme",
        personName: "jane doe",
        email: "jane@acme.com",
      },
      provenance: [{ sourceFilename: "d", importRunId: "r", rowNumber: 2 }],
    },
    {
      recordId: "5",
      raw: { organization: "Global Systems", personName: "Alex Kim" },
      normalized: { organization: "global systems", personName: "alex kim" },
      provenance: [{ sourceFilename: "e", importRunId: "r", rowNumber: 2 }],
    },
    {
      recordId: "6",
      raw: { organization: "Global System", personName: "Alex Kim" },
      normalized: { organization: "global system", personName: "alex kim" },
      provenance: [{ sourceFilename: "f", importRunId: "r", rowNumber: 2 }],
    },
  ];
  const result = dedupeProspects(records);
  assert.equal(result.resolved[0]?.resolution.kind, "stable-source-id");
  assert.equal(result.resolved[1]?.resolution.kind, "email");
  assert.equal(
    result.candidates[0]?.reason,
    "Similar organization and exact person name require review",
  );
  assert.deepEqual(result.unresolved, []);
  assert.equal(result.resolved[0]?.record.provenance.length, 2);
});

test("spreadsheet sanitizer prevents formula injection while preserving text", async () => {
  for (const value of ["=SUM(A1:A2)", "+cmd", "-danger", "@mention"])
    assert.equal(sanitizeExportCell(value), `'${value}`);
  assert.equal(sanitizeExportCell("safe"), "safe");
  const imported = await importCsv(fixture("formula-values.csv"), {
    importRunId: "formula",
  });
  assert.equal(
    sanitizeExportCell(imported.rows[0]?.raw.organization),
    '\'=HYPERLINK("http://bad")',
  );
});
