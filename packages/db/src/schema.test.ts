import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { requiredTables } from "./schema/index.js";
const migration = await readFile(
  new URL("../migrations/0001_initial.sql", import.meta.url),
  "utf8",
);
test("initial migration defines every required normalized entity", () => {
  for (const table of requiredTables)
    assert.match(migration, new RegExp(`CREATE TABLE ${table} \\(`));
});
test("immutable policy and append-only event constraints are database enforced", () => {
  assert.match(migration, /scoring_policies_immutable/);
  for (const table of ["review_events", "action_events", "audit_events"])
    assert.match(migration, new RegExp(`${table}_append_only`));
});
test("closed workflow values use PostgreSQL enums", () => {
  assert.match(migration, /CREATE TYPE prospect_status AS ENUM/);
  assert.match(migration, /CREATE TYPE review_status AS ENUM/);
});
