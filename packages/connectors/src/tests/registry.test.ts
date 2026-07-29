import assert from "node:assert/strict";
import test from "node:test";
import type { SourceAdapter } from "../source-adapter.js";
import {
  DuplicateSourceAdapterError,
  SourceAdapterRegistry,
} from "../registry.js";

function adapter(
  id: string,
  capabilities: SourceAdapter["capabilities"],
): SourceAdapter {
  return {
    id,
    capabilities,
    authority: "first_party",
    async health() {
      return { status: "healthy", checkedAt: "2026-07-29T00:00:00Z" };
    },
    async retrieve() {
      return {
        status: "empty",
        startedAt: "2026-07-29T00:00:00Z",
        completedAt: "2026-07-29T00:00:01Z",
      };
    },
  };
}

test("looks up adapters by ID and capability", () => {
  const crm = adapter("crm", ["account_truth", "contact_truth"]);
  const web = adapter("web", ["public_research"]);
  const registry = new SourceAdapterRegistry([crm, web]);

  assert.equal(registry.getById("crm"), crm);
  assert.equal(registry.getById("missing"), undefined);
  assert.deepEqual(registry.getByCapability("public_research"), [web]);
  assert.deepEqual(registry.getByCapability("account_truth"), [crm]);
});

test("rejects duplicate adapter IDs", () => {
  const registry = new SourceAdapterRegistry([
    adapter("crm", ["account_truth"]),
  ]);

  assert.throws(
    () => registry.register(adapter("crm", ["contact_truth"])),
    DuplicateSourceAdapterError,
  );
});
