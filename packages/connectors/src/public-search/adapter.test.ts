import assert from "node:assert/strict";
import test from "node:test";
import { PublicSearchAdapter, SearXNGSearchProvider } from "./index.js";

test("returns an explicit limited result when broader search is unconfigured", async () => {
  const adapter = new PublicSearchAdapter();
  assert.deepEqual(await adapter.search({ query: "example" }), {
    kind: "limited",
    reason: "search_provider_unconfigured",
  });
});

test("SearXNG configuration and transport are injected", async () => {
  let requested: URL | undefined;
  const provider = new SearXNGSearchProvider({
    baseUrl: "https://search.example/internal/",
    headers: { authorization: "Bearer injected" },
    fetch: async (input, init) => {
      requested = new URL(String(input));
      assert.equal(
        new Headers(init?.headers).get("authorization"),
        "Bearer injected",
      );
      return Response.json({
        results: [
          {
            url: "https://result.example/page",
            title: "Result",
            content: "Snippet",
          },
          { url: "file:///private", title: "Invalid" },
        ],
      });
    },
  });
  const result = await new PublicSearchAdapter(provider).search({
    query: "people & programs",
    limit: 5,
  });
  assert.equal(requested?.pathname, "/internal/search");
  assert.equal(requested?.searchParams.get("q"), "people & programs");
  assert.deepEqual(result, {
    kind: "success",
    results: [
      {
        url: "https://result.example/page",
        title: "Result",
        snippet: "Snippet",
      },
    ],
  });
});

test("both adapter declarations grant only public research authority", () => {
  const search = new PublicSearchAdapter();
  assert.deepEqual(search.declaration.capabilities, ["public_research"]);
  assert.equal(search.declaration.authority.capability, "public_research");
  assert.equal(search.declaration.authority.requiresCredential, false);
});
