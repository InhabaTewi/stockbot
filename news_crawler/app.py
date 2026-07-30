from __future__ import annotations

from dataclasses import asdict
from typing import List, Literal, Optional

import requests
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field

from .clients import FirecrawlClient, SearxNGClient
from .config import Settings
from .domain import STOCKS, get_stock
from .pipeline import NewsPipeline
from .repository import NewsRepository
from .reviewer import ModelReviewer

settings = Settings.from_env()
repository = NewsRepository(settings.database_path)


def current_reviewer() -> ModelReviewer:
    config = repository.model_config(
        {
            "api_url": settings.review_api_url,
            "api_key": settings.review_api_key,
            "model": settings.review_model,
        }
    )
    return ModelReviewer(
        config["api_url"], config["api_key"], config["model"], settings.request_timeout
    )


pipeline = NewsPipeline(
    SearxNGClient(settings.searxng_url, settings.request_timeout),
    FirecrawlClient(
        settings.firecrawl_url, settings.firecrawl_api_key, settings.request_timeout
    ),
    current_reviewer(),
    repository,
    current_reviewer,
)

app = FastAPI(title="Stock News Crawler", version="0.1.0")


class CrawlRequest(BaseModel):
    symbols: List[str] = Field(default_factory=lambda: list(STOCKS))
    max_results: int = Field(default=5, ge=1, le=20)


class AdminSettingsUpdate(BaseModel):
    manual_review_enabled: bool
    review_api_url: str = Field(min_length=1, max_length=500)
    review_model: str = Field(min_length=1, max_length=200)
    review_api_key: Optional[str] = Field(default=None, max_length=1000)


class ReviewDecisionRequest(BaseModel):
    decision: Literal["approved", "rejected"]
    note: str = Field(default="", max_length=1000)


def admin_settings_payload():
    model = repository.model_config(
        {
            "api_url": settings.review_api_url,
            "api_key": settings.review_api_key,
            "model": settings.review_model,
        }
    )
    return {
        "manual_review_enabled": repository.manual_review_enabled(),
        "review_api_url": model["api_url"],
        "review_model": model["model"],
        "review_api_key_configured": model["api_key_configured"],
        "counts": repository.counts(),
        "dependencies": dependency_status(),
    }


def dependency_status():
    dependencies = {}
    try:
        response = requests.get(
            f"{settings.searxng_url}/search",
            params={"q": "healthcheck", "format": "json", "engines": "baidu"},
            timeout=8,
        )
        response.raise_for_status()
        response.json()
        dependencies["searxng"] = {"ok": True, "url": settings.searxng_url}
    except Exception as exc:
        dependencies["searxng"] = {
            "ok": False,
            "url": settings.searxng_url,
            "error": str(exc),
        }
    try:
        response = requests.post(
            f"{settings.firecrawl_url}/v1/scrape", json={}, timeout=3
        )
        if response.status_code == 404:
            raise RuntimeError("Firecrawl scrape endpoint returned 404")
        if response.status_code >= 500:
            response.raise_for_status()
        dependencies["firecrawl"] = {"ok": True, "url": settings.firecrawl_url}
    except Exception as exc:
        dependencies["firecrawl"] = {
            "ok": False,
            "url": settings.firecrawl_url,
            "error": str(exc),
        }
    return dependencies


@app.get("/health")
def health():
    model = repository.model_config(
        {
            "api_url": settings.review_api_url,
            "api_key": settings.review_api_key,
            "model": settings.review_model,
        }
    )
    services = dependency_status()
    return {
        "ok": all(service["ok"] for service in services.values()),
        "dependencies": {
            "searxng": settings.searxng_url,
            "firecrawl": settings.firecrawl_url,
            "reviewModel": model["model"],
            "reviewConfigured": model["api_key_configured"],
        },
        "database": repository.counts(),
        "services": services,
    }


@app.get("/v1/stocks")
def stocks():
    return {"items": [asdict(stock) for stock in STOCKS.values()]}


@app.post("/v1/crawl")
def crawl(request: CrawlRequest):
    try:
        stats = pipeline.crawl(request.symbols, request.max_results)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"items": {symbol: asdict(item) for symbol, item in stats.items()}}


@app.get("/v1/articles")
def articles(
    symbol: Optional[str] = None,
    limit: int = Query(default=50, ge=1, le=200),
):
    normalized = get_stock(symbol).symbol if symbol else None
    return {"items": repository.list_approved(normalized, limit), "meta": repository.counts()}


@app.get("/v1/admin/settings")
def admin_settings():
    return admin_settings_payload()


@app.put("/v1/admin/settings")
def update_admin_settings(request: AdminSettingsUpdate):
    released = repository.set_manual_review_enabled(request.manual_review_enabled)
    repository.update_model_config(
        request.review_api_url.strip(),
        request.review_model.strip(),
        request.review_api_key,
    )
    payload = admin_settings_payload()
    payload["released_pending"] = released
    return payload


@app.get("/v1/admin/reviews")
def admin_reviews(
    status: Optional[Literal["pending", "approved", "rejected", "failed"]] = None,
    limit: int = Query(default=100, ge=1, le=500),
):
    return {"items": repository.list_reviews(status, limit), "meta": repository.counts()}


@app.post("/v1/admin/reviews/{article_id}/decision")
def admin_review_decision(article_id: int, request: ReviewDecisionRequest):
    try:
        repository.decide_review(article_id, request.decision, request.note)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return {"ok": True, "counts": repository.counts()}