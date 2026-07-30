from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse

import requests
import trafilatura
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from trafilatura.metadata import extract_metadata

app = FastAPI(title="Firecrawl-compatible Article Extractor", version="0.1.0")

MAX_RESPONSE_BYTES = 8 * 1024 * 1024


class ScrapeRequest(BaseModel):
    url: str = Field(min_length=8, max_length=2000)
    formats: list[str] = Field(default_factory=lambda: ["markdown"])
    onlyMainContent: bool = True


def ensure_public_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("Only public HTTP(S) URLs can be scraped")
    try:
        addresses = socket.getaddrinfo(parsed.hostname, parsed.port or 443)
    except socket.gaierror as exc:
        raise ValueError("Article hostname cannot be resolved") from exc
    for address in addresses:
        ip = ipaddress.ip_address(address[4][0])
        if not ip.is_global:
            raise ValueError("Private and reserved network addresses are blocked")


def download_html(url: str) -> bytes:
    response = requests.get(
        url,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                "Chrome/124.0 Safari/537.36"
            )
        },
        timeout=30,
        stream=True,
    )
    response.raise_for_status()
    ensure_public_url(response.url)
    chunks = []
    size = 0
    for chunk in response.iter_content(64 * 1024):
        size += len(chunk)
        if size > MAX_RESPONSE_BYTES:
            raise ValueError("Article response exceeds 8 MiB")
        chunks.append(chunk)
    return b"".join(chunks)


@app.get("/")
@app.get("/health")
def health():
    return {"ok": True, "api": "firecrawl-v1-compatible", "extractor": "trafilatura"}


@app.post("/v1/scrape")
def scrape(request: ScrapeRequest):
    try:
        ensure_public_url(request.url)
        html = download_html(request.url)
        markdown = trafilatura.extract(
            html,
            url=request.url,
            output_format="markdown",
            include_links=True,
            include_formatting=True,
            favor_precision=True,
        )
        if not markdown:
            raise ValueError("No article content could be extracted")
        metadata = extract_metadata(html, default_url=request.url)
    except (requests.RequestException, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return {
        "success": True,
        "data": {
            "markdown": markdown,
            "metadata": {
                "title": getattr(metadata, "title", None),
                "sourceURL": request.url,
                "publishedTime": getattr(metadata, "date", None),
                "source": getattr(metadata, "sitename", None),
            },
        },
    }