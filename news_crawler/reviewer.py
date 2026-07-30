from __future__ import annotations

import json
from dataclasses import dataclass
from typing import List

import requests

from .clients import ScrapedArticle
from .domain import StockProfile


@dataclass(frozen=True)
class ReviewResult:
    approved: bool
    relevant: bool
    politically_sensitive: bool
    categories: List[str]
    reason: str
    summary: str
    sentiment: str


class ModelReviewer:
    def __init__(
        self, api_url: str, api_key: str, model: str, timeout: int = 45
    ) -> None:
        self.api_url = api_url
        self.api_key = api_key
        self.model = model
        self.timeout = timeout

    def review(self, stock: StockProfile, article: ScrapedArticle) -> ReviewResult:
        if not self.api_key:
            raise RuntimeError("NEWS_REVIEW_API_KEY or DEEPSEEK_API_KEY is not configured")
        response = requests.post(
            self.api_url,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": self.model,
                "temperature": 0,
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content": _SYSTEM_PROMPT},
                    {
                        "role": "user",
                        "content": json.dumps(
                            {
                                "stock": {
                                    "symbol": stock.symbol,
                                    "name": stock.name,
                                    "aliases": stock.aliases,
                                },
                                "article": {
                                    "title": article.title,
                                    "url": article.url,
                                    "content": article.content[:16000],
                                },
                            },
                            ensure_ascii=False,
                        ),
                    },
                ],
            },
            timeout=self.timeout,
        )
        response.raise_for_status()
        raw = response.json()["choices"][0]["message"]["content"]
        data = json.loads(raw)
        sensitive = bool(data.get("politically_sensitive", True))
        relevant = bool(data.get("relevant", False))
        return ReviewResult(
            approved=bool(data.get("approved", False)) and relevant and not sensitive,
            relevant=relevant,
            politically_sensitive=sensitive,
            categories=[str(value) for value in data.get("categories", [])],
            reason=str(data.get("reason") or ""),
            summary=str(data.get("summary") or "").strip(),
            sentiment=str(data.get("sentiment") or "neutral").lower(),
        )


_SYSTEM_PROMPT = """你是金融资讯发布前的内容合规审核器。仅输出 JSON，不要输出 Markdown。
判断文章是否与指定股票直接相关，并检测是否包含不适合进入普通股票资讯产品的违法违规政治敏感内容。
普通的公司公告、监管披露、宏观政策和客观新闻不应仅因提到政府或政策而判敏感；但煽动、极端主义、仇恨、未经证实的重大政治指控、规避审查指导等应拦截。
输出字段：approved(boolean), relevant(boolean), politically_sensitive(boolean), categories(string[]), reason(string), summary(string), sentiment("positive"|"negative"|"neutral")。
summary 用简体中文客观概括核心事实，不超过 120 字，不添加原文没有的信息。approved 仅在 relevant=true 且 politically_sensitive=false 时为 true。"""