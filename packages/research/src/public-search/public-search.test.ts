import assert from "node:assert/strict";
import test from "node:test";
import { publicSearchFromEnvironment } from "./index.js";

test("SearXNG configuration is provider neutral and results are bounded", async () => {
  const fetcher: typeof fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.searchParams.get("format"), "json");
    return new Response(
      JSON.stringify({
        results: Array.from({ length: 25 }, (_, index) => ({
          title: `Result ${index}`,
          url: `https://example.com/${index}`,
          content: "x".repeat(2_000),
        })),
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  const adapter = publicSearchFromEnvironment(
    {
      PUBLIC_SEARCH_PROVIDER: "searxng",
      PUBLIC_SEARCH_BASE_URL: "http://127.0.0.1:8080/",
    },
    fetcher,
  );
  const results = await adapter?.search("public evidence", 100);
  assert.equal(results?.length, 20);
  assert.equal(results?.[0]?.snippet.length, 1_000);
});

test("adapter rejects endpoints containing credentials", () => {
  assert.throws(
    () =>
      publicSearchFromEnvironment({
        PUBLIC_SEARCH_PROVIDER: "searxng",
        PUBLIC_SEARCH_BASE_URL: "http://user:secret@localhost:8080",
      }),
    /without credentials/,
  );
});
