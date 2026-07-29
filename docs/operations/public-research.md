# Local public research services

The optional local research stack consists of a private SearXNG metasearch endpoint and a separate Python extraction worker. Both ports bind to `127.0.0.1`, not all host interfaces. The application talks to them through provider-neutral TypeScript adapters; it does not expose either service as a product endpoint.

## Configure and start

Copy the example environment and replace the extraction allowlist with the exact public hostnames approved by policy. Approval is exact-host only: approving `example.org` does not approve its subdomains.

```bash
cp .env.example .env
# Edit PUBLIC_EXTRACTION_ALLOWED_HOSTS in .env before starting.
docker compose --env-file .env -f compose.public-research.yml build extraction-worker
docker compose --env-file .env -f compose.public-research.yml up -d
docker compose --env-file .env -f compose.public-research.yml ps
curl --fail http://127.0.0.1:8080/healthz
curl --fail http://127.0.0.1:8787/healthz
```

Use these application values when the application itself runs on the host:

```dotenv
PUBLIC_SEARCH_PROVIDER=searxng
PUBLIC_SEARCH_BASE_URL=http://127.0.0.1:8080
PUBLIC_EXTRACTION_WORKER_URL=http://127.0.0.1:8787
```

When another Compose service consumes them, use the service names and container ports instead (`http://searxng:8080` and `http://extraction-worker:8787`). Stop the stack with:

```bash
docker compose --env-file .env -f compose.public-research.yml down
```

SearXNG uses a repository-owned configuration, has JSON output explicitly enabled, applies safe search, disables image proxying, and bounds upstream timeouts. Its pinned image and read-only, capability-dropped container make local startup predictable. Change the deliberately non-secret local SearXNG key before adapting this configuration for any non-loopback deployment.

## Extraction protocol and security boundary

`POST /v1/extract` accepts only this closed request shape (unknown fields are rejected):

```json
{
  "url": "https://www.example.org/public-announcement",
  "mode": "static",
  "maxCharacters": 50000
}
```

- `url` must be credential-free HTTP(S), match an exact hostname in `PUBLIC_EXTRACTION_ALLOWED_HOSTS`, and resolve exclusively to globally routable addresses. Redirect targets are checked again.
- The schema has no cookies, headers, authorization, request bodies, browser arguments, or session fields. Supplying any such field fails validation. Never place credentials in the URL or allowlist authenticated/restricted destinations.
- `maxCharacters` is constrained to 1,000–100,000. Responses contain only final URL, a 500-character title, bounded extracted text, content type, retrieval time, extractor name, and truncation flag.
- `mode: static` uses Crawl4AI only. The caller may set `difficult-page` only after its normal retrieval has identified a genuinely difficult public page. Even then, the worker tries Crawl4AI first and invokes Scrapling only after that attempt fails. There is intentionally no request field for selecting Scrapling.
- URL validation is an application-layer defense. Production deployment should additionally apply outbound firewall/proxy rules for defense in depth and keep this unauthenticated worker reachable only from its trusted application network.

Example request after allowlisting `www.example.org`:

```bash
curl --fail-with-body http://127.0.0.1:8787/v1/extract \
  --header 'content-type: application/json' \
  --data '{"url":"https://www.example.org/","mode":"static","maxCharacters":10000}'
```

## Reproducible worker dependencies

The worker image installs the exact direct dependency versions in `workers/public-extraction/requirements.lock`, then installs the browsers required by Crawl4AI and Scrapling during the image build. Do not replace the image build with global `pip install` commands. To run worker policy tests without the container, create an isolated Python 3.12 environment:

```bash
python3.12 -m venv .venv-public-extraction
. .venv-public-extraction/bin/activate
python -m pip install -r workers/public-extraction/requirements.lock
PYTHONPATH=workers/public-extraction python -m unittest discover \
  -s workers/public-extraction/tests -v
```
