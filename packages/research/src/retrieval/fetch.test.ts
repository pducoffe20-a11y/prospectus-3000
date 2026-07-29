import assert from "node:assert/strict";
import test from "node:test";
import { createHtmlFetcher, MAX_HTML_BYTES } from "./fetch-html.js";
import { createPdfFetcher } from "./fetch-pdf.js";
import type {
  PolicyDecision,
  RetrievalDependencies,
  TransportResponse,
} from "./types.js";

const approved: PolicyDecision = {
  allowed: true,
  reason: "Public retrieval approved",
  robots: "allowed",
  public: true,
  pdfAllowed: true,
};

function response(
  status: number,
  headers: Record<string, string>,
  chunks: Uint8Array[] = [],
): TransportResponse {
  return {
    status,
    headers,
    body: (async function* () {
      yield* chunks;
    })(),
    metadata: { protocol: "http/1.1" },
  };
}

function dependencies(
  requests: TransportResponse[],
  decisions: PolicyDecision[] = [approved],
) {
  const policyUrls: string[] = [];
  const requestUrls: string[] = [];
  const requestHeaders: Readonly<Record<string, string>>[] = [];
  let now = 0;
  const value: RetrievalDependencies = {
    clock: { now: () => (now += 1) },
    timer: {
      set: () => 1,
      clear: () => undefined,
    },
    dnsPolicy: {
      check: async (url) => {
        policyUrls.push(url.href);
        return decisions.shift() ?? approved;
      },
    },
    domainLimiter: { acquire: async () => () => undefined },
    transport: {
      request: async ({ url, headers }) => {
        requestUrls.push(url.href);
        requestHeaders.push(headers);
        const next = requests.shift();
        if (!next) throw new Error("No fake response");
        return next;
      },
    },
  };
  return { value, policyUrls, requestUrls, requestHeaders };
}

const options = {
  userAgent: "ProspectusResearch/1.0",
  domainLimits: { concurrency: 2, requestsPerSecond: 1 },
};

test("HTML retrieval rechecks policy on redirects and records transport", async () => {
  const fake = dependencies([
    response(302, { location: "https://other.example/page" }),
    response(200, { "content-type": "text/html; charset=utf-8" }, [
      new TextEncoder().encode("<p>ok</p>"),
    ]),
  ]);
  const result = await createHtmlFetcher(
    fake.value,
    options,
  )("http://start.example/");

  assert.equal(result.outcome, "success");
  assert.deepEqual(fake.policyUrls, [
    "http://start.example/",
    "https://other.example/page",
  ]);
  assert.equal(fake.requestHeaders[0]?.["user-agent"], options.userAgent);
  assert.equal(result.attempts.length, 2);
  assert.deepEqual(result.attempts[1]?.metadata, { protocol: "http/1.1" });
});

test("HTML body is stopped with a typed limited outcome", async () => {
  const fake = dependencies([
    response(200, { "content-type": "text/html" }, [
      new Uint8Array(MAX_HTML_BYTES + 1),
    ]),
  ]);
  const result = await createHtmlFetcher(
    fake.value,
    options,
  )("https://public.example/");

  assert.equal(result.outcome, "limited");
  if (result.outcome === "limited") {
    assert.equal(result.maximumBytes, MAX_HTML_BYTES);
    assert.equal(result.bytesRead, MAX_HTML_BYTES + 1);
  }
});

test("PDF retrieval requires explicit public-PDF approval without transport", async () => {
  const denied = { ...approved, pdfAllowed: false };
  const fake = dependencies([], [denied]);
  const result = await createPdfFetcher(
    fake.value,
    options,
  )("https://public.example/report.pdf");

  assert.equal(result.outcome, "failed");
  if (result.outcome === "failed") assert.equal(result.failure, "permission");
  assert.deepEqual(fake.requestUrls, []);
  assert.equal(result.policy, denied);
});

test("PDF content type and signature are both validated", async () => {
  const fake = dependencies([
    response(200, { "content-type": "application/pdf" }, [
      new TextEncoder().encode("not a pdf"),
    ]),
  ]);
  const result = await createPdfFetcher(
    fake.value,
    options,
  )("https://public.example/report.pdf");

  assert.equal(result.outcome, "failed");
  if (result.outcome === "failed") assert.equal(result.failure, "validation");
});
