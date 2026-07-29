import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
test("migration is transactional and does not store core account fields in JSONB", async () => {
  const sql = await readFile("packages/db/migrations/0001_initial.sql", "utf8");
  assert.match(sql, /^BEGIN;/);
  assert.match(sql, /COMMIT;\s*$/);
  const accounts = sql.match(/CREATE TABLE accounts \([\s\S]*?\);/)?.[0] ?? "";
  assert.doesNotMatch(accounts, /jsonb/i);
});
