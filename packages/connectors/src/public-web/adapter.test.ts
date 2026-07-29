import assert from "node:assert/strict";
import test from "node:test";
import { PublicWebAdapter, normalizePublicTarget } from "./index.js";
import type { ResearchRetrievalBoundary, RetrievalAttempt } from "./index.js";

const html = {
  url: "https://example.com/",
  mediaType: "text/html",
  text: "hello",
};

function boundary(
  http: RetrievalAttempt,
  calls: string[],
): ResearchRetrievalBoundary {
  return {
    async retrieveHttp() {
      calls.push("http");
      return http;
    },
    async extractPdf(document) {
      calls.push("pdf");
      return {
        kind: "document",
        document: { ...document, mediaType: "text/plain", text: "pdf" },
      };
    },
    async renderBrowser(url) {
      calls.push("browser");
      return {
        kind: "document",
        document: { ...html, url: url.href, text: "rendered" },
      };
    },
  };
}

test("normalizes domains but rejects non-HTTP targets and embedded credentials", () => {
  assert.equal(
    normalizePublicTarget("example.com/news").href,
    "https://example.com/news",
  );
  assert.throws(
    () => normalizePublicTarget("file:///etc/passwd"),
    /HTTP or HTTPS/,
  );
  assert.throws(
    () => normalizePublicTarget("https://user:pass@example.com"),
    /credentials/,
  );
});

test("uses ordinary HTTP without invoking specialized retrieval", async () => {
  const calls: string[] = [];
  const result = await new PublicWebAdapter(
    boundary({ kind: "document", document: html }, calls),
  ).retrieve({ target: "example.com" });
  assert.equal(result.kind, "success");
  assert.deepEqual(calls, ["http"]);
});

test("extracts an HTTP-retrieved PDF only when permitted", async () => {
  const calls: string[] = [];
  const pdf = { ...html, mediaType: "application/pdf; charset=binary" };
  const adapter = new PublicWebAdapter(
    boundary({ kind: "document", document: pdf }, calls),
  );
  assert.deepEqual(await adapter.retrieve({ target: pdf.url }), {
    kind: "limited",
    reason: "pdf_extraction_not_permitted",
  });
  assert.deepEqual(calls, ["http"]);

  calls.length = 0;
  const result = await adapter.retrieve({
    target: pdf.url,
    permitPdfExtraction: true,
  });
  assert.equal(result.kind === "success" ? result.method : undefined, "pdf");
  assert.deepEqual(calls, ["http", "pdf"]);
});

test("renders only when HTTP identifies a genuine need and approval exists", async () => {
  const calls: string[] = [];
  const required = {
    kind: "requires_browser",
    url: html.url,
    reason: "client_rendered",
  } as const;
  const adapter = new PublicWebAdapter(boundary(required, calls));
  assert.deepEqual(await adapter.retrieve({ target: html.url }), {
    kind: "limited",
    reason: "browser_rendering_not_approved",
  });
  assert.deepEqual(calls, ["http"]);

  calls.length = 0;
  const result = await adapter.retrieve({
    target: html.url,
    approveBrowserRendering: true,
  });
  assert.equal(
    result.kind === "success" ? result.method : undefined,
    "browser",
  );
  assert.deepEqual(calls, ["http", "browser"]);
});
