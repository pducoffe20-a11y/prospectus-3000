import assert from "node:assert/strict";
import test from "node:test";
import {
  PublicPageRenderError,
  renderPublicPage,
  type BrowserNavigation,
  type BrowserRequest,
  type OrdinaryHttpRetrievalControls,
  type PublicPageBrowser,
  type PublicPageBrowserPage,
  type ValidatedPublicPageRequest,
} from "./render-public-page.js";

const request = {
  url: new URL("https://example.com/start"),
} as unknown as ValidatedPublicPageRequest;

function harness(html = "<script>bad()</script><main>public</main>") {
  const validated: string[] = [];
  const throttled: string[] = [];
  let requestHandler: ((request: BrowserRequest) => Promise<void>) | undefined;
  let navigationHandler:
    ((event: BrowserNavigation) => Promise<void>) | undefined;
  let options: Parameters<PublicPageBrowser["createIsolatedContext"]>[0];
  let closed = false;
  const page: PublicPageBrowserPage = {
    interceptRequests(handler) {
      requestHandler = handler;
    },
    observeNavigation(handler) {
      navigationHandler = handler;
    },
    rejectDownloads() {},
    rejectDialogs() {},
    async goto() {
      await navigationHandler?.({
        url: "https://example.com/start",
        changesDocument: true,
      });
    },
    async html() {
      return html;
    },
  };
  const browser: PublicPageBrowser = {
    async createIsolatedContext(value) {
      options = value;
      return {
        async newPage() {
          return page;
        },
        async close() {
          closed = true;
        },
      };
    },
  };
  const controls: OrdinaryHttpRetrievalControls = {
    userAgent: "DeclaredResearchBot/1.0",
    maxContentBytes: 1_024,
    async validateUrlAndIp(url) {
      validated.push(url.href);
    },
    async throttleDomain(url) {
      throttled.push(url.hostname);
    },
    sanitize(content) {
      return content.replace(/<script>.*?<\/script>/g, "");
    },
  };
  return {
    browser,
    controls,
    validated,
    throttled,
    get requestHandler() {
      return requestHandler;
    },
    get navigationHandler() {
      return navigationHandler;
    },
    get options() {
      return options;
    },
    get closed() {
      return closed;
    },
  };
}

test("renders only an authorized HTTP fallback in an isolated bounded context", async () => {
  const state = harness();
  const result = await renderPublicPage(
    request,
    { kind: "rendering-required", url: request.url.href },
    state.browser,
    state.controls,
  );

  assert.deepEqual(result, {
    method: "browser-render",
    url: request.url.href,
    content: "<main>public</main>",
  });
  assert.equal(state.options.userAgent, "DeclaredResearchBot/1.0");
  assert.equal(state.options.sandbox, true);
  assert.equal(state.options.acceptDownloads, false);
  assert.equal(state.options.persistentStorage, false);
  assert.equal(state.options.credentials, "omit");
  assert.equal(state.options.maxResponseBytes, 1_024);
  assert.deepEqual(state.validated, [request.url.href, request.url.href]);
  assert.equal(state.closed, true);
});

test("blocks authenticated and state-changing browser requests", async () => {
  const state = harness();
  await renderPublicPage(
    request,
    { kind: "rendering-required", url: request.url.href },
    state.browser,
    state.controls,
  );
  let outcome = "";
  await state.requestHandler?.({
    url: "https://example.com/send",
    method: "POST",
    resourceType: "fetch",
    isNavigationRequest: false,
    headers: { authorization: "secret" },
    abort(reason) {
      outcome = reason;
    },
    continue() {
      outcome = "continued";
    },
  });
  assert.match(outcome, /interactive or authenticated/);
});

test("rejects selection without a matching rendering-required result", async () => {
  const state = harness();
  await assert.rejects(
    renderPublicPage(
      request,
      { kind: "rendering-required", url: "https://example.com/other" },
      state.browser,
      state.controls,
    ),
    (error: unknown) =>
      error instanceof PublicPageRenderError &&
      error.code === "fallback-not-authorized",
  );
});

test("revalidates redirects and stops after five", async () => {
  const state = harness();
  await renderPublicPage(
    request,
    { kind: "rendering-required", url: request.url.href },
    state.browser,
    state.controls,
  );
  for (let index = 1; index <= 5; index += 1)
    await state.navigationHandler?.({
      url: `https://redirect${index}.example/page`,
      changesDocument: true,
    });
  await assert.rejects(
    () =>
      state.navigationHandler!({
        url: "https://redirect6.example/page",
        changesDocument: true,
      }),
    (error: unknown) =>
      error instanceof PublicPageRenderError && error.code === "redirect-limit",
  );
});
