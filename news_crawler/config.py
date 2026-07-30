from __future__ import annotations

import os
from dataclasses import dataclass

try:
    from dotenv import load_dotenv

    load_dotenv("/proj/.env", override=False)
except ImportError:
    pass


@dataclass(frozen=True)
class Settings:
    searxng_url: str
    firecrawl_url: str
    firecrawl_api_key: str
    review_api_url: str
    review_api_key: str
    review_model: str
    database_path: str
    request_timeout: int

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            searxng_url=os.getenv("SEARXNG_URL", "http://127.0.0.1:8088").rstrip("/"),
            firecrawl_url=os.getenv("FIRECRAWL_URL", "http://127.0.0.1:3002").rstrip("/"),
            firecrawl_api_key=os.getenv("FIRECRAWL_API_KEY", ""),
            review_api_url=_chat_completions_url(
                os.getenv("NEWS_REVIEW_API_URL", "https://api.deepseek.com")
            ),
            review_api_key=os.getenv("NEWS_REVIEW_API_KEY")
            or os.getenv("DEEPSEEK_API_KEY", ""),
            review_model=os.getenv("NEWS_REVIEW_MODEL", "deepseek-chat"),
            database_path=os.getenv(
                "NEWS_DATABASE_PATH", "/proj/stock_project/data/news_crawler.db"
            ),
            request_timeout=int(os.getenv("NEWS_REQUEST_TIMEOUT", "45")),
        )


def _chat_completions_url(base_url: str) -> str:
    url = base_url.rstrip("/")
    if url.endswith("/chat/completions"):
        return url
    if not url.endswith("/v1"):
        url = f"{url}/v1"
    return f"{url}/chat/completions"