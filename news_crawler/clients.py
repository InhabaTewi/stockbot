from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import requests


@dataclass(frozen=True)
class SearchResult:
    title: str
    url: str
    snippet: str
    published_at: Optional[str] = None
    source: Optional[str] = None


@dataclass(frozen=True)
class ScrapedArticle:
    title: str
    url: str
    content: str
    published_at: Optional[str] = None
    source: Optional[str] = None


class SearxNGClient:
    def __init__(self, base_url: str, timeout: int = 45) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def search(self, query: str, limit: int) -> List[SearchResult]:
        response = requests.get(
            f"{self.base_url}/search",
            params={
                "q": query,
                "format": "json",
                "categories": "news,general",
                "engines": "baidu,sogou,360search",
                "language": "zh-CN",
                "time_range": "month",
            },
            timeout=self.timeout,
        )
        response.raise_for_status()
        results = []
        for item in response.json().get("results", []):
            url = str(item.get("url") or "").strip()
            if not url:
                continue
            results.append(
                SearchResult(
                    title=str(item.get("title") or "").strip(),
                    url=url,
                    snippet=str(item.get("content") or "").strip(),
                    published_at=item.get("publishedDate") or item.get("published_date"),
                    source=item.get("engine"),
                )
            )
            if len(results) >= limit:
                break
        return results


class FirecrawlClient:
    def __init__(self, base_url: str, api_key: str = "", timeout: int = 45) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout

    def scrape(self, result: SearchResult) -> ScrapedArticle:
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        response = requests.post(
            f"{self.base_url}/v1/scrape",
            headers=headers,
            json={"url": result.url, "formats": ["markdown"], "onlyMainContent": True},
            timeout=self.timeout,
        )
        response.raise_for_status()
        payload = response.json()
        if payload.get("success") is False:
            raise RuntimeError(payload.get("error") or "Firecrawl scrape failed")
        data = payload.get("data") or payload
        metadata: Dict[str, Any] = data.get("metadata") or {}
        content = str(data.get("markdown") or "").strip()
        if not content:
            raise RuntimeError("Firecrawl returned empty article content")
        return ScrapedArticle(
            title=str(metadata.get("title") or result.title).strip(),
            url=str(metadata.get("sourceURL") or result.url),
            content=content,
            published_at=metadata.get("publishedTime") or result.published_at,
            source=metadata.get("source") or result.source,
        )