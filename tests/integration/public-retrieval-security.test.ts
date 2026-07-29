import assert from "node:assert/strict";
import test from "node:test";
import {
  parseConnectorInputRecord,
  PUBLIC_RETRIEVAL_OPERATION,
  PublicRetrievalRegistry,
  type PublicRetrievalAdapter,
} from "../../packages/connectors/src/import/index.js";

const prohibitedLinkedInOperations = [
  "automated-login",
  "password-handling",
  "cookie-handling",
  "session-capture",
  "restricted-page-scraping",
  "access-control-bypass",
  "connection-request",
  "message-sending",
] as const;

const publicAdapter: PublicRetrievalAdapter = {
  id: "public-http",
  operationKinds: [PUBLIC_RETRIEVAL_OPERATION],
  async dispatch(request) {
    return request.url;
  },
};

test("prohibited LinkedIn operation kinds cannot be registered", () => {
  for (const kind of prohibitedLinkedInOperations) {
    const registry = new PublicRetrievalRegistry();
    assert.throws(
      () =>
        registry.register({
          ...publicAdapter,
          id: `linkedin-${kind}`,
          operationKinds: [kind],
        } as unknown as PublicRetrievalAdapter),
      /prohibited operation kind/,
    );
  }
});

test("prohibited LinkedIn operation kinds cannot be dispatched", async () => {
  const registry = new PublicRetrievalRegistry();
  registry.register(publicAdapter);
  for (const kind of prohibitedLinkedInOperations)
    await assert.rejects(
      registry.dispatch("public-http", {
        kind,
        url: "https://www.linkedin.com/in/example",
      }),
      /Public retrieval request denied/,
    );
});

test("a user-provided LinkedIn URL is reference-only, never authorization to authenticate or scrape", async () => {
  const input = parseConnectorInputRecord({
    kind: "user-provided-url",
    url: "https://www.linkedin.com/in/example",
    provenance: { actorId: "user-123", recordedAt: "2026-07-29T12:00:00Z" },
    authority: { basis: "user-provided", scope: "reference-only" },
  });
  assert.deepEqual(input.authority, {
    basis: "user-provided",
    scope: "reference-only",
  });
  assert.equal(input.kind, "user-provided-url");
  if (input.kind !== "user-provided-url")
    throw new Error("Expected a user-provided URL input");

  const registry = new PublicRetrievalRegistry();
  registry.register(publicAdapter);
  await assert.rejects(
    registry.dispatch("public-http", {
      kind: PUBLIC_RETRIEVAL_OPERATION,
      url: input.url,
    }),
    /LinkedIn URLs are reference-only/,
  );
});

test("connector inputs reject undeclared authority, credentials, and crawl requests", () => {
  for (const input of [
    { kind: "public-crawl-request", url: "https://example.com" },
    {
      kind: "user-provided-url",
      url: "https://example.com",
      provenance: { actorId: "user-123", recordedAt: "2026-07-29T12:00:00Z" },
      authority: { basis: "user-provided", scope: "authenticate" },
    },
    {
      kind: "manual-note",
      note: "captured by user",
      password: "secret",
      provenance: { actorId: "user-123", recordedAt: "2026-07-29T12:00:00Z" },
      authority: { basis: "user-authored", scope: "note-only" },
    },
  ])
    assert.throws(() => parseConnectorInputRecord(input));
});
