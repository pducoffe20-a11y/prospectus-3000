/**
 * Browser rendering is deliberately an adapter-driven fallback. The adapter is
 * responsible for creating a fresh, sandboxed browser context and enforcing
 * response byte limits while responses are streamed; this module owns policy
 * revalidation and the browser's permitted behaviour.
 */

const validatedPublicPage = Symbol("validated-public-page");

export const PUBLIC_PAGE_RENDER_LIMITS = {
  maxRedirects: 5,
  timeoutMs: 20_000,
} as const;

/** Constructed by ordinary HTTP retrieval only after its URL validation. */
export interface ValidatedPublicPageRequest {
  readonly url: URL;
  readonly [validatedPublicPage]: true;
}

/** The only ordinary-HTTP result which permits selecting browser rendering. */
export interface RenderingRequired {
  readonly kind: "rendering-required";
  readonly url: string;
}

export interface SanitizedPublicPage {
  readonly method: "browser-render";
  readonly url: string;
  readonly content: string;
}

export interface BrowserRequest {
  readonly url: string;
  readonly method: string;
  readonly resourceType: string;
  readonly isNavigationRequest: boolean;
  readonly headers: Readonly<Record<string, string | undefined>>;
  abort(reason: string): Promise<void> | void;
  continue(): Promise<void> | void;
}

export interface BrowserNavigation {
  readonly url: string;
  /** True for redirects and frame/document navigations, not hash changes. */
  readonly changesDocument: boolean;
}

export interface PublicPageBrowserPage {
  interceptRequests(handler: (request: BrowserRequest) => Promise<void>): void;
  observeNavigation(handler: (event: BrowserNavigation) => Promise<void>): void;
  rejectDownloads(handler: () => void): void;
  rejectDialogs(handler: () => void): void;
  goto(url: string, options: { signal: AbortSignal }): Promise<void>;
  html(): Promise<string>;
}

export interface PublicPageBrowserContext {
  newPage(): Promise<PublicPageBrowserPage>;
  close(): Promise<void>;
}

export interface PublicPageBrowser {
  createIsolatedContext(options: {
    userAgent: string;
    sandbox: true;
    acceptDownloads: false;
    persistentStorage: false;
    credentials: "omit";
    maxResponseBytes: number;
  }): Promise<PublicPageBrowserContext>;
}

/** These are the same concrete functions/configuration used by HTTP retrieval. */
export interface OrdinaryHttpRetrievalControls {
  readonly userAgent: string;
  readonly maxContentBytes: number;
  validateUrlAndIp(url: URL): Promise<void>;
  throttleDomain(url: URL): Promise<void>;
  sanitize(content: string, sourceUrl: URL): string;
}

export class PublicPageRenderError extends Error {
  constructor(
    readonly code:
      | "fallback-not-authorized"
      | "navigation-blocked"
      | "redirect-limit"
      | "content-limit"
      | "timeout",
    message: string,
  ) {
    super(message);
    this.name = "PublicPageRenderError";
  }
}

const forbiddenHeader = /^(authorization|cookie|proxy-authorization)$/i;
const safeMethod = /^(GET|HEAD)$/i;
const forbiddenResource = /^(websocket|eventsource|ping|beacon)$/i;

async function applyNavigationPolicy(
  url: URL,
  controls: OrdinaryHttpRetrievalControls,
  signal: AbortSignal,
) {
  if (url.username || url.password)
    throw new PublicPageRenderError(
      "navigation-blocked",
      "Credential-bearing URLs are not permitted",
    );
  await beforeTimeout(controls.validateUrlAndIp(url), signal);
  await beforeTimeout(controls.throttleDomain(url), signal);
}

async function beforeTimeout<T>(promise: Promise<T>, signal: AbortSignal) {
  if (signal.aborted)
    throw new PublicPageRenderError(
      "timeout",
      "Browser rendering exceeded 20 seconds",
    );
  let listener: (() => void) | undefined;
  const expired = new Promise<never>((_, reject) => {
    listener = () =>
      reject(
        new PublicPageRenderError(
          "timeout",
          "Browser rendering exceeded 20 seconds",
        ),
      );
    signal.addEventListener("abort", listener, { once: true });
  });
  try {
    return await Promise.race([promise, expired]);
  } finally {
    if (listener) signal.removeEventListener("abort", listener);
  }
}

/**
 * Render a public page only when ordinary HTTP explicitly requested this
 * fallback. No browser state or unsanitized page data is returned to callers.
 */
export async function renderPublicPage(
  request: ValidatedPublicPageRequest,
  required: RenderingRequired,
  browser: PublicPageBrowser,
  controls: OrdinaryHttpRetrievalControls,
): Promise<SanitizedPublicPage> {
  if (
    required.kind !== "rendering-required" ||
    new URL(required.url).href !== request.url.href
  )
    throw new PublicPageRenderError(
      "fallback-not-authorized",
      "Browser rendering requires a matching rendering-required HTTP result",
    );

  const timeout = AbortSignal.timeout(PUBLIC_PAGE_RENDER_LIMITS.timeoutMs);
  let context: PublicPageBrowserContext | undefined;
  let currentUrl = new URL(request.url);
  let documentChanges = 0;
  try {
    // Validation during request construction may be stale (DNS rebinding), so
    // always repeat it immediately before opening the browser.
    await applyNavigationPolicy(currentUrl, controls, timeout);
    context = await beforeTimeout(
      browser.createIsolatedContext({
        userAgent: controls.userAgent,
        sandbox: true,
        acceptDownloads: false,
        persistentStorage: false,
        credentials: "omit",
        maxResponseBytes: controls.maxContentBytes,
      }),
      timeout,
    );
    const page = await beforeTimeout(context.newPage(), timeout);
    page.rejectDownloads(() => undefined);
    page.rejectDialogs(() => undefined);
    page.interceptRequests(async (browserRequest) => {
      const url = new URL(browserRequest.url);
      const hasCredentialHeader = Object.keys(browserRequest.headers).some(
        (header) => forbiddenHeader.test(header),
      );
      if (
        !safeMethod.test(browserRequest.method) ||
        forbiddenResource.test(browserRequest.resourceType) ||
        hasCredentialHeader
      ) {
        await browserRequest.abort("interactive or authenticated request");
        return;
      }
      try {
        // Subresources can influence the resulting document too, so they are
        // subject to the same URL, resolved-IP, and domain-rate policy.
        await applyNavigationPolicy(url, controls, timeout);
        await beforeTimeout(
          Promise.resolve(browserRequest.continue()),
          timeout,
        );
      } catch {
        await browserRequest.abort("public URL/IP policy rejected request");
      }
    });
    page.observeNavigation(async (event) => {
      if (!event.changesDocument) return;
      documentChanges += 1;
      // Navigation observers also report the initial document commit. Thus one
      // initial commit plus five subsequent documents is the permitted ceiling.
      if (documentChanges > PUBLIC_PAGE_RENDER_LIMITS.maxRedirects + 1)
        throw new PublicPageRenderError(
          "redirect-limit",
          "Browser navigation exceeded five document changes",
        );
      const next = new URL(event.url, currentUrl);
      await applyNavigationPolicy(next, controls, timeout);
      currentUrl = next;
    });

    await beforeTimeout(
      page.goto(request.url.href, { signal: timeout }),
      timeout,
    );
    const html = await beforeTimeout(page.html(), timeout);
    if (Buffer.byteLength(html, "utf8") > controls.maxContentBytes)
      throw new PublicPageRenderError(
        "content-limit",
        "Rendered document exceeded the HTTP retrieval content limit",
      );
    return {
      method: "browser-render",
      url: currentUrl.href,
      content: controls.sanitize(html, currentUrl),
    };
  } catch (error) {
    if (timeout.aborted && !(error instanceof PublicPageRenderError))
      throw new PublicPageRenderError(
        "timeout",
        "Browser rendering exceeded 20 seconds",
      );
    throw error;
  } finally {
    await context?.close();
  }
}
