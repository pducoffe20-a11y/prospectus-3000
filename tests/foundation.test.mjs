import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("workspace foundation declares supported runtime and private packages", async () => {
  const rootPackage = JSON.parse(await readFile("package.json", "utf8"));
  const webPackage = JSON.parse(
    await readFile("apps/web/package.json", "utf8"),
  );
  const workerPackage = JSON.parse(
    await readFile("apps/worker/package.json", "utf8"),
  );

  assert.equal(rootPackage.private, true);
  assert.match(rootPackage.packageManager, /^pnpm@10\./);
  assert.equal(webPackage.private, true);
  assert.equal(workerPackage.private, true);
});

test("design contract records explicit approval without overstating completion", async () => {
test("design contract remains explicitly gated on approval", async () => {
  const contract = await readFile(
    "docs/architecture/design-contract.md",
    "utf8",
  );
  assert.match(contract, /approved by Pat on July 29, 2026/i);
  assert.match(contract, /Approval does not imply backend/i);
  assert.match(contract, /awaiting Pat's explicit approval/i);
  assert.match(contract, /mobile-work-now\.svg/);
  assert.match(contract, /offline-dashboard\.svg/);
});
