from __future__ import annotations

import os
from collections import defaultdict
from typing import Any, Callable, Dict, List, Optional

import requests


NEWS_CRAWLER_URL = os.getenv("NEWS_CRAWLER_URL", "http://127.0.0.1:8010").rstrip("/")
NEWS_CRAWLER_TIMEOUT = float(os.getenv("NEWS_CRAWLER_TIMEOUT", "5"))

EXPERIMENTAL_STOCKS = {
    "1810.HK": {
        "name": "小米集团-W",
        "description": "智能手机、AIoT 与智能汽车业务集团",
        "sector_id": "consumer-electronics",
        "sector_name": "消费电子与智能汽车",
    },
    "2513.HK": {
        "name": "智谱",
        "description": "大模型基础技术与企业级 AI 应用公司",
        "sector_id": "large-model",
        "sector_name": "大模型",
    },
}

CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS stock_news_articles (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    crawler_article_id BIGINT,
    symbol VARCHAR(32) NOT NULL,
    stock_name VARCHAR(128) NOT NULL,
    title VARCHAR(512) NOT NULL,
    url VARCHAR(2048) NOT NULL,
    source VARCHAR(255),
    published_at VARCHAR(64),
    summary TEXT,
    sentiment VARCHAR(16) NOT NULL DEFAULT 'neutral',
    crawler_created_at VARCHAR(64),
    synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_stock_news_symbol_url (symbol, url(512)),
    KEY idx_stock_news_symbol_time (symbol, published_at)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
"""


def sync_news_articles(db_connection: Callable[[], Any], limit: int = 200) -> Dict[str, int]:
    response = requests.get(
        f"{NEWS_CRAWLER_URL}/v1/articles",
        params={"limit": limit},
        timeout=NEWS_CRAWLER_TIMEOUT,
    )
    response.raise_for_status()
    articles = response.json().get("items", [])

    connection = db_connection()
    cursor = connection.cursor()
    try:
        cursor.execute(CREATE_TABLE_SQL)
        for article in articles:
            cursor.execute(
                """
                INSERT INTO stock_news_articles (
                    crawler_article_id, symbol, stock_name, title, url, source,
                    published_at, summary, sentiment, crawler_created_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    crawler_article_id=VALUES(crawler_article_id),
                    stock_name=VALUES(stock_name), title=VALUES(title),
                    source=VALUES(source), published_at=VALUES(published_at),
                    summary=VALUES(summary), sentiment=VALUES(sentiment),
                    crawler_created_at=VALUES(crawler_created_at)
                """,
                (
                    article.get("id"),
                    article.get("symbol"),
                    article.get("stock_name"),
                    article.get("title"),
                    article.get("url"),
                    article.get("source"),
                    article.get("published_at"),
                    article.get("summary"),
                    article.get("sentiment") or "neutral",
                    article.get("created_at"),
                ),
            )
        connection.commit()
        return {"received": len(articles), "synced": len(articles)}
    except Exception:
        connection.rollback()
        raise
    finally:
        cursor.close()
        connection.close()


def get_news_articles(
    db_connection: Callable[[], Any], symbol: Optional[str] = None, limit: int = 50
) -> Dict[str, Any]:
    connection = db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute(CREATE_TABLE_SQL)
        parameters: List[Any] = []
        where = ""
        if symbol:
            where = "WHERE symbol=%s"
            parameters.append(symbol)
        parameters.append(limit)
        cursor.execute(
            f"""
            SELECT id, symbol, stock_name, title, url, source, published_at,
                   summary, sentiment, crawler_created_at AS created_at
            FROM stock_news_articles
            {where}
            ORDER BY COALESCE(published_at, crawler_created_at) DESC
            LIMIT %s
            """,
            parameters,
        )
        articles = cursor.fetchall()
    finally:
        cursor.close()
        connection.close()

    grouped: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for article in articles:
        article_symbol = str(article.get("symbol") or "")
        grouped[article_symbol].append(article)

    sectors: Dict[str, Dict[str, Any]] = {}
    for symbol, profile in EXPERIMENTAL_STOCKS.items():
        sector = sectors.setdefault(
            profile["sector_id"],
            {"id": profile["sector_id"], "name": profile["sector_name"], "stocks": []},
        )
        stock_articles = grouped.get(symbol, [])
        positive = [item for item in stock_articles if item.get("sentiment") == "positive"]
        negative = [item for item in stock_articles if item.get("sentiment") == "negative"]
        neutral = [
            item
            for item in stock_articles
            if item.get("sentiment") not in {"positive", "negative"}
        ]
        sector["stocks"].append(
            {
                "symbol": symbol,
                "name": profile["name"],
                "description": profile["description"],
                "positive": positive,
                "negative": negative,
                "neutral": neutral,
                "articleCount": len(stock_articles),
            }
        )

    return {
        "markets": [
            {
                "id": "hk",
                "name": "港股",
                "description": "聚焦港股实验标的的已审核实时资讯",
                "sectors": list(sectors.values()),
            }
        ],
        "meta": {
            "source": "stock-news-database",
            "available": True,
            "articleCount": len(articles),
            "disclaimer": "资讯经模型合规初筛，仅供研究参考，不构成投资建议。",
        },
    }