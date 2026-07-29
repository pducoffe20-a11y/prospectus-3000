import asyncio
import ipaddress
import os
import socket
from datetime import datetime, timezone
from typing import Literal
from urllib.parse import urlsplit, urlunsplit

from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict, Field, HttpUrl
from scrapling.fetchers import DynamicFetcher

DEFAULT_MAX_CHARACTERS = 50_000
HARD_MAX_CHARACTERS = 100_000
ALLOWED_HOSTS = frozenset(
    host.strip().lower().rstrip(".")
    for host in os.environ.get("PUBLIC_EXTRACTION_ALLOWED_HOSTS", "").split(",")
    if host.strip()
)
USER_AGENT = os.environ.get(
    "PUBLIC_RESEARCH_USER_AGENT", "ProspectIntelligenceCockpit/0.1"
)


class ExtractionRequest(BaseModel):
    """Intentionally excludes headers, cookies, credentials, method, and browser options."""

    model_config = ConfigDict(extra="forbid")
    url: HttpUrl
    mode: Literal["static", "difficult-page"] = "static"
    maxCharacters: int = Field(DEFAULT_MAX_CHARACTERS, ge=1_000, le=HARD_MAX_CHARACTERS)


class ExtractionResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    url: HttpUrl
    title: str = Field(max_length=500)
    content: str
    contentType: str = Field(max_length=100)
    fetchedAt: datetime
    extractor: Literal["crawl4ai", "scrapling"]
    truncated: bool


app = FastAPI(
    title="Public extraction worker",
    version="1.0.0",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)


def _is_public(address: str) -> bool:
    ip = ipaddress.ip_address(address)
    return ip.is_global and not any(
        (ip.is_private, ip.is_loopback, ip.is_link_local, ip.is_multicast,
         ip.is_reserved, ip.is_unspecified)
    )


async def validate_public_url(raw_url: str) -> str:
    parsed = urlsplit(raw_url)
    host = (parsed.hostname or "").lower().rstrip(".")
    if parsed.scheme not in {"http", "https"} or parsed.username or parsed.password:
        raise HTTPException(400, "Only credential-free HTTP(S) URLs are accepted")
    if not ALLOWED_HOSTS or host not in ALLOWED_HOSTS:
        raise HTTPException(403, "Destination hostname is not policy-approved")
    try:
        records = await asyncio.get_running_loop().run_in_executor(
            None, lambda: socket.getaddrinfo(host, parsed.port, type=socket.SOCK_STREAM)
        )
    except socket.gaierror as error:
        raise HTTPException(400, "Destination hostname could not be resolved") from error
    if not records or any(not _is_public(record[4][0]) for record in records):
        raise HTTPException(403, "Destination does not resolve exclusively to public addresses")
    # Drop fragments and normalize without ever serializing userinfo.
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path or "/", parsed.query, ""))


def bounded(content: str, maximum: int) -> tuple[str, bool]:
    return content[:maximum], len(content) > maximum


async def crawl4ai_extract(url: str) -> tuple[str, str, str]:
    browser = BrowserConfig(headless=True, user_agent=USER_AGENT)
    run = CrawlerRunConfig(page_timeout=20_000, word_count_threshold=10)
    async with AsyncWebCrawler(config=browser) as crawler:
        result = await crawler.arun(url=url, config=run)
    if not result.success:
        raise RuntimeError(result.error_message or "Crawl4AI extraction failed")
    markdown = result.markdown.raw_markdown if result.markdown else ""
    title = str((result.metadata or {}).get("title", ""))
    return str(result.url), title, markdown


async def scrapling_extract(url: str) -> tuple[str, str, str]:
    # This renderer is reachable only from the difficult-page fallback below.
    page = await asyncio.to_thread(
        DynamicFetcher.fetch,
        url,
        headless=True,
        disable_resources=True,
        network_idle=True,
        timeout=20_000,
    )
    title = page.css("title::text").get(default="")
    return str(page.url), str(title), page.get_all_text(separator=" ", strip=True)


@app.get("/healthz", include_in_schema=False)
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/v1/extract", response_model=ExtractionResponse)
async def extract(request: ExtractionRequest) -> ExtractionResponse:
    url = await validate_public_url(str(request.url))
    extractor: Literal["crawl4ai", "scrapling"] = "crawl4ai"
    try:
        final_url, title, content = await asyncio.wait_for(crawl4ai_extract(url), 25)
    except (RuntimeError, TimeoutError):
        if request.mode != "difficult-page":
            raise HTTPException(422, "Static extraction failed; rendering was not policy-approved")
        extractor = "scrapling"
        try:
            final_url, title, content = await asyncio.wait_for(scrapling_extract(url), 25)
        except (RuntimeError, TimeoutError) as error:
            raise HTTPException(422, "Difficult-page extraction failed") from error
    # Redirect destinations must pass the same allowlist and public-DNS policy.
    final_url = await validate_public_url(final_url)
    content, truncated = bounded(content, request.maxCharacters)
    return ExtractionResponse(
        url=final_url,
        title=title[:500],
        content=content,
        contentType="text/markdown" if extractor == "crawl4ai" else "text/plain",
        fetchedAt=datetime.now(timezone.utc),
        extractor=extractor,
        truncated=truncated,
    )
