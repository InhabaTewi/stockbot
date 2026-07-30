from __future__ import annotations

import json
import os
import sqlite3
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from .clients import ScrapedArticle
from .domain import ReviewStatus, StockProfile
from .reviewer import ReviewResult


class NewsRepository:
    def __init__(self, database_path: str) -> None:
        self.database_path = database_path
        parent = os.path.dirname(database_path)
        if parent:
            os.makedirs(parent, exist_ok=True)
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
        return connection

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS articles (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    symbol TEXT NOT NULL,
                    stock_name TEXT NOT NULL,
                    title TEXT NOT NULL,
                    url TEXT NOT NULL,
                    source TEXT,
                    published_at TEXT,
                    content TEXT NOT NULL,
                    summary TEXT,
                    sentiment TEXT NOT NULL DEFAULT 'neutral',
                    review_status TEXT NOT NULL,
                    politically_sensitive INTEGER NOT NULL DEFAULT 0,
                    relevant INTEGER NOT NULL DEFAULT 0,
                    review_categories TEXT NOT NULL DEFAULT '[]',
                    review_reason TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    UNIQUE(symbol, url)
                );
                CREATE INDEX IF NOT EXISTS idx_articles_public
                    ON articles(review_status, symbol, published_at);
                CREATE TABLE IF NOT EXISTS app_settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS review_actions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    article_id INTEGER NOT NULL,
                    previous_status TEXT NOT NULL,
                    decision TEXT NOT NULL,
                    note TEXT NOT NULL DEFAULT '',
                    actor TEXT NOT NULL DEFAULT 'admin',
                    created_at TEXT NOT NULL,
                    FOREIGN KEY(article_id) REFERENCES articles(id)
                );
                """
            )
            connection.execute(
                """
                INSERT OR IGNORE INTO app_settings (key, value, updated_at)
                VALUES ('manual_review_enabled', 'false', ?)
                """,
                (datetime.now(timezone.utc).isoformat(),),
            )

    def get_setting(self, key: str, default: str = "") -> str:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT value FROM app_settings WHERE key=?", (key,)
            ).fetchone()
        return str(row["value"]) if row else default

    def set_setting(self, key: str, value: str) -> None:
        now = datetime.now(timezone.utc).isoformat()
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET
                    value=excluded.value, updated_at=excluded.updated_at
                """,
                (key, value, now),
            )

    def manual_review_enabled(self) -> bool:
        return self.get_setting("manual_review_enabled", "false").lower() == "true"

    def set_manual_review_enabled(self, enabled: bool) -> int:
        self.set_setting("manual_review_enabled", str(enabled).lower())
        if enabled:
            return 0
        now = datetime.now(timezone.utc).isoformat()
        with self._connect() as connection:
            pending = connection.execute(
                """
                SELECT id FROM articles
                WHERE review_status=? AND relevant=1 AND politically_sensitive=0
                """,
                (ReviewStatus.PENDING.value,),
            ).fetchall()
            connection.execute(
                """
                UPDATE articles SET review_status=?, updated_at=?
                WHERE review_status=? AND relevant=1 AND politically_sensitive=0
                """,
                (
                    ReviewStatus.APPROVED.value,
                    now,
                    ReviewStatus.PENDING.value,
                ),
            )
            connection.executemany(
                """
                INSERT INTO review_actions (
                    article_id, previous_status, decision, note, actor, created_at
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                [
                    (
                        row["id"],
                        ReviewStatus.PENDING.value,
                        ReviewStatus.APPROVED.value,
                        "人工审核关闭，安全待审内容自动发布",
                        "system",
                        now,
                    )
                    for row in pending
                ],
            )
        return len(pending)

    def model_config(self, defaults: Dict[str, str]) -> Dict[str, Any]:
        api_key = self.get_setting("review_api_key", defaults.get("api_key", ""))
        return {
            "api_url": self.get_setting("review_api_url", defaults.get("api_url", "")),
            "model": self.get_setting("review_model", defaults.get("model", "")),
            "api_key": api_key,
            "api_key_configured": bool(api_key),
        }

    def update_model_config(
        self, api_url: str, model: str, api_key: Optional[str] = None
    ) -> None:
        self.set_setting("review_api_url", api_url)
        self.set_setting("review_model", model)
        if api_key is not None:
            self.set_setting("review_api_key", api_key)

    def has_url(self, symbol: str, url: str) -> bool:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT 1 FROM articles
                WHERE symbol=? AND url=? AND review_status<>?
                """,
                (symbol, url, ReviewStatus.FAILED.value),
            ).fetchone()
        return row is not None

    def save_review(
        self,
        stock: StockProfile,
        article: ScrapedArticle,
        review: ReviewResult,
        manual_review_enabled: bool = False,
    ) -> None:
        now = datetime.now(timezone.utc).isoformat()
        if review.approved and manual_review_enabled:
            status = ReviewStatus.PENDING
        else:
            status = ReviewStatus.APPROVED if review.approved else ReviewStatus.REJECTED
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO articles (
                    symbol, stock_name, title, url, source, published_at, content,
                    summary, sentiment, review_status, politically_sensitive,
                    relevant, review_categories, review_reason, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(symbol, url) DO UPDATE SET
                    title=excluded.title, source=excluded.source,
                    published_at=excluded.published_at, content=excluded.content,
                    summary=excluded.summary, sentiment=excluded.sentiment,
                    review_status=excluded.review_status,
                    politically_sensitive=excluded.politically_sensitive,
                    relevant=excluded.relevant,
                    review_categories=excluded.review_categories,
                    review_reason=excluded.review_reason, updated_at=excluded.updated_at
                """,
                (
                    stock.symbol,
                    stock.name,
                    article.title,
                    article.url,
                    article.source,
                    article.published_at,
                    article.content,
                    review.summary,
                    review.sentiment,
                    status.value,
                    int(review.politically_sensitive),
                    int(review.relevant),
                    json.dumps(review.categories, ensure_ascii=False),
                    review.reason,
                    now,
                    now,
                ),
            )

    def save_failure(
        self, stock: StockProfile, title: str, url: str, reason: str
    ) -> None:
        now = datetime.now(timezone.utc).isoformat()
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO articles (
                    symbol, stock_name, title, url, content, review_status,
                    review_reason, created_at, updated_at
                ) VALUES (?, ?, ?, ?, '', ?, ?, ?, ?)
                ON CONFLICT(symbol, url) DO UPDATE SET
                    review_status=excluded.review_status,
                    review_reason=excluded.review_reason, updated_at=excluded.updated_at
                """,
                (
                    stock.symbol,
                    stock.name,
                    title or url,
                    url,
                    ReviewStatus.FAILED.value,
                    reason[:1000],
                    now,
                    now,
                ),
            )

    def list_approved(
        self, symbol: Optional[str] = None, limit: int = 50
    ) -> List[Dict[str, Any]]:
        conditions = ["review_status=?", "relevant=1", "politically_sensitive=0"]
        parameters: List[Any] = [ReviewStatus.APPROVED.value]
        if symbol:
            conditions.append("symbol=?")
            parameters.append(symbol)
        parameters.append(limit)
        with self._connect() as connection:
            rows = connection.execute(
                f"""
                SELECT id, symbol, stock_name, title, url, source, published_at,
                       summary, sentiment, created_at
                FROM articles
                WHERE {' AND '.join(conditions)}
                ORDER BY COALESCE(published_at, created_at) DESC
                LIMIT ?
                """,
                parameters,
            ).fetchall()
        return [dict(row) for row in rows]

    def list_reviews(
        self, status: Optional[str] = None, limit: int = 100
    ) -> List[Dict[str, Any]]:
        parameters: List[Any] = []
        where = ""
        if status:
            where = "WHERE review_status=?"
            parameters.append(status)
        parameters.append(limit)
        with self._connect() as connection:
            rows = connection.execute(
                f"""
                SELECT id, symbol, stock_name, title, url, source, published_at,
                       summary, sentiment, review_status, politically_sensitive,
                       relevant, review_categories, review_reason, created_at, updated_at
                FROM articles
                {where}
                ORDER BY updated_at DESC
                LIMIT ?
                """,
                parameters,
            ).fetchall()
        items = []
        for row in rows:
            item = dict(row)
            item["politically_sensitive"] = bool(item["politically_sensitive"])
            item["relevant"] = bool(item["relevant"])
            item["review_categories"] = json.loads(item["review_categories"] or "[]")
            items.append(item)
        return items

    def decide_review(self, article_id: int, decision: str, note: str = "") -> None:
        if decision not in {ReviewStatus.APPROVED.value, ReviewStatus.REJECTED.value}:
            raise ValueError(f"unsupported review decision: {decision}")
        now = datetime.now(timezone.utc).isoformat()
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT review_status, relevant, politically_sensitive
                FROM articles WHERE id=?
                """,
                (article_id,),
            ).fetchone()
            if not row:
                raise LookupError(f"article not found: {article_id}")
            if row["review_status"] != ReviewStatus.PENDING.value:
                raise ValueError("only pending articles can be manually reviewed")
            if decision == ReviewStatus.APPROVED.value and (
                not row["relevant"] or row["politically_sensitive"]
            ):
                raise ValueError("unsafe or irrelevant article cannot be approved")
            connection.execute(
                "UPDATE articles SET review_status=?, updated_at=? WHERE id=?",
                (decision, now, article_id),
            )
            connection.execute(
                """
                INSERT INTO review_actions (
                    article_id, previous_status, decision, note, created_at
                ) VALUES (?, ?, ?, ?, ?)
                """,
                (article_id, row["review_status"], decision, note[:1000], now),
            )

    def counts(self) -> Dict[str, int]:
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT review_status, COUNT(*) AS count FROM articles GROUP BY review_status"
            ).fetchall()
        return {str(row["review_status"]): int(row["count"]) for row in rows}