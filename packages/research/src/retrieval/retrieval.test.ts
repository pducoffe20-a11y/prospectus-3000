import assert from "node:assert/strict";
import test from "node:test";
import { retrievePublicPage } from "./retrieve.js";
import { searchPublicWeb } from "./search.js";

const publicDns = async () => [
  { address: "93.184.216.34", family: 4 as const },
];

test("retrieves a bounded public HTTP response", async () => {
  const result = await retrievePublicPage(
    "https://example.com/research#fragment",
    {
      lookup: publicDns,
      fetch: async () =>
        new Response("public evidence", {
          headers: { "content-type": "text/plain; charset=utf-8" },
        }),
      now: () => new Date("2026-07-29T00:00:00.000Z"),
    },
  );
  assert.deepEqual(result, {
    status: "retrieved",
    requestedUrl: "https://example.com/research#fragment",
    finalUrl: "https://example.com/research",
    redirects: [],
    contentType: "text/plain; charset=utf-8",
    body: "public evidence",
    bytes: 15,
    retrievedAt: "2026-07-29T00:00:00.000Z",
  });
});

test("denies LinkedIn, credentials, local names, and private literal addresses before fetch", async () => {
  let calls = 0;
  const fetch = async () => {
    calls += 1;
    return new Response("unexpected");
  };
  for (const [url, reason] of [
    ["https://linkedin.com/in/person", "linkedin_not_retrievable"],
    ["https://user:secret@example.com", "credentials_not_allowed"],
    ["http://service.internal/data", "non_public_host"],
    ["http://127.0.0.1/admin", "non_public_host"],
  ] as const) {
    const result = await retrievePublicPage(url, { lookup: publicDns, fetch });
    assert.equal(result.status, "denied");
    assert.equal(result.status === "denied" && result.reason, reason);
  }
  assert.equal(calls, 0);
});

test("denies DNS rebinding and revalidates a redirect target", async () => {
  const hosts: string[] = [];
  const lookup = async (hostname: string) => {
    hosts.push(hostname);
    return hostname === "public.example"
      ? [{ address: "93.184.216.34", family: 4 as const }]
      : [{ address: "169.254.169.254", family: 4 as const }];
  };
  const result = await retrievePublicPage("https://public.example", {
    lookup,
    fetch: async () =>
      new Response(null, {
        status: 302,
        headers: { location: "http://metadata.example/latest" },
      }),
  });
  assert.equal(result.status, "denied");
  assert.equal(result.status === "denied" && result.reason, "non_public_host");
  assert.deepEqual(hosts, ["public.example", "metadata.example"]);
});

test("bounds streamed bodies", async () => {
  const result = await retrievePublicPage("https://example.com", {
    lookup: publicDns,
    maxBytes: 4,
    fetch: async () =>
      new Response("12345", { headers: { "content-type": "text/html" } }),
  });
  assert.equal(result.status, "denied");
  assert.equal(
    result.status === "denied" && result.reason,
    "response_too_large",
  );
});

test("search-provider failures degrade explicitly without a scraping fallback", async () => {
  assert.deepEqual(await searchPublicWeb("example"), {
    status: "unavailable",
    results: [],
    reason: "not_configured",
  });
  assert.deepEqual(
    await searchPublicWeb("example", {
      search: async () => {
        throw new Error("quota exhausted");
      },
    }),
    { status: "unavailable", results: [], reason: "provider_error" },
  );
});

test("search results retain only URLs permitted by retrieval policy", async () => {
  const outcome = await searchPublicWeb("example", {
    search: async () => [
      { title: "Allowed", url: "https://example.com" },
      { title: "LinkedIn", url: "https://linkedin.com/in/person" },
      { title: "Local", url: "http://127.0.0.1" },
    ],
  });
  assert.deepEqual(outcome, {
    status: "available",
    results: [{ title: "Allowed", url: "https://example.com" }],
  });
});
