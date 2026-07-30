from __future__ import annotations

import json
import os
import re
import sqlite3
import threading
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Dict, List

import requests


ARTIFICIAL_ANALYSIS_CHARTS = {
    "intelligence": {
        "name": "综合智能",
        "url": "https://artificialanalysis.ai/?intelligence=artificial-analysis-intelligence-index",
        "field": "intelligenceIndex",
    },
    "coding": {
        "name": "编程能力",
        "url": "https://artificialanalysis.ai/?intelligence=coding-index",
        "field": "codingIndex",
    },
    "agentic": {
        "name": "智能体能力",
        "url": "https://artificialanalysis.ai/?intelligence=agentic-index",
        "field": "agenticIndex",
    },
}

OPENROUTER_URL = "https://openrouter.ai/rankings#leaderboard-table"
OPENROUTER_API_URL = "https://openrouter.ai/api/frontend/v1/rankings/models"
REQUEST_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "Chrome/124.0 Safari/537.36"
    )
}
DEFAULT_DB_PATH = Path(__file__).resolve().parents[1] / "data" / "model_rankings.sqlite3"
DB_PATH = Path(os.getenv("MODEL_RANKINGS_DB_PATH", str(DEFAULT_DB_PATH)))
ARTIFICIAL_ANALYSIS_REFRESH = timedelta(hours=12)
OPENROUTER_REFRESH = timedelta(hours=1)
_refresh_lock = threading.Lock()


@dataclass(frozen=True)
class RankingFetchResult:
    source: str
    chart: str
    source_url: str
    items: List[Dict[str, Any]]


class _VisibleTextParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.hidden_depth = 0
        self.parts: List[str] = []

    def handle_starttag(self, tag: str, _attrs: list) -> None:
        if tag in {"script", "style", "svg", "noscript"}:
            self.hidden_depth += 1

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style", "svg", "noscript"} and self.hidden_depth:
            self.hidden_depth -= 1

    def handle_data(self, data: str) -> None:
        value = data.strip()
        if value and not self.hidden_depth:
            self.parts.append(value)


def _page_html(url: str, timeout: float = 30) -> str:
    response = requests.get(url, headers=REQUEST_HEADERS, timeout=timeout)
    response.raise_for_status()
    return response.text


def _visible_text(html: str) -> str:
    parser = _VisibleTextParser()
    parser.feed(html)
    if not parser.parts:
        raise ValueError("No readable ranking content returned")
    return "\n".join(parser.parts)


def parse_artificial_analysis(html: str, field: str) -> List[Dict[str, Any]]:
    normalized = html.replace(r'\"', '"')
    pattern = re.compile(
        r'\{"id":"[^"]+","slug":"[^"]+","name":"(?P<model>[^"]+)"'
        r'(?:(?!\},\{"id":).){0,2500}?'
        r'"intelligenceIndex":(?P<intelligence>-?\d+(?:\.\d+)?|null),'
        r'"intelligenceIndexIsEstimated":(?:true|false),'
        r'"codingIndex":(?P<coding>-?\d+(?:\.\d+)?|null),'
        r'"agenticIndex":(?P<agentic>-?\d+(?:\.\d+)?|null)',
        re.DOTALL,
    )
    scores_by_model = {}
    for match in pattern.finditer(normalized):
        score = match.group(field.removesuffix("Index"))
        if score == "null":
            continue
        model = json.loads(f'"{match.group("model")}"')
        scores_by_model[model] = float(score)
    if not scores_by_model:
        raise ValueError(f"Artificial Analysis field not found: {field}")
    ranked = sorted(scores_by_model.items(), key=lambda item: item[1], reverse=True)
    return [
        {"rank": index + 1, "model": model, "score": score}
        for index, (model, score) in enumerate(ranked)
    ]


def _openrouter_display_name(permaslug: str) -> str:
    slug = permaslug.split(":", 1)[0].split("/", 1)[-1]
    slug = re.sub(r"-\d{8}$", "", slug)
    return " ".join(part.upper() if len(part) <= 3 else part.title() for part in slug.split("-"))


def parse_openrouter(rows: List[Dict[str, Any]], limit: int = 20) -> List[Dict[str, Any]]:
    ranked = sorted(
        rows,
        key=lambda row: (row.get("total_prompt_tokens") or 0)
        + (row.get("total_completion_tokens") or 0),
        reverse=True,
    )
    items = []
    for index, row in enumerate(ranked[:limit]):
        permaslug = str(row.get("variant_permaslug") or row.get("model_permaslug") or "")
        provider = permaslug.split("/", 1)[0]
        total_tokens = (row.get("total_prompt_tokens") or 0) + (
            row.get("total_completion_tokens") or 0
        )
        items.append(
            {
                "rank": index + 1,
                "model": _openrouter_display_name(permaslug),
                "modelId": permaslug,
                "provider": provider,
                "tokens": total_tokens,
                "change": row.get("change"),
            }
        )
    if not items:
        raise ValueError("OpenRouter leaderboard rows not found")
    return items


def fetch_artificial_analysis(chart: str) -> RankingFetchResult:
    config = ARTIFICIAL_ANALYSIS_CHARTS[chart]
    items = parse_artificial_analysis(_page_html(config["url"]), config["field"])
    return RankingFetchResult("artificial-analysis", chart, config["url"], items)


def fetch_openrouter() -> RankingFetchResult:
    response = requests.get(
        OPENROUTER_API_URL,
        params={"view": "week"},
        headers=REQUEST_HEADERS,
        timeout=30,
    )
    response.raise_for_status()
    return RankingFetchResult(
        "openrouter",
        "weekly-usage",
        OPENROUTER_URL,
        parse_openrouter(response.json().get("data") or []),
    )


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS ranking_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source TEXT NOT NULL,
            chart TEXT NOT NULL,
            source_url TEXT NOT NULL,
            captured_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_ranking_snapshots_chart_time
            ON ranking_snapshots(source, chart, captured_at DESC);
        CREATE TABLE IF NOT EXISTS ranking_items (
            snapshot_id INTEGER NOT NULL REFERENCES ranking_snapshots(id) ON DELETE CASCADE,
            rank INTEGER NOT NULL,
            model TEXT NOT NULL,
            score REAL,
            model_id TEXT,
            provider TEXT,
            tokens INTEGER,
            change_value REAL,
            PRIMARY KEY (snapshot_id, rank)
        );
        CREATE TABLE IF NOT EXISTS ranking_changes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            snapshot_id INTEGER NOT NULL REFERENCES ranking_snapshots(id) ON DELETE CASCADE,
            chart TEXT NOT NULL,
            model TEXT NOT NULL,
            previous_rank INTEGER,
            current_rank INTEGER NOT NULL,
            rank_delta INTEGER,
            changed_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_ranking_changes_chart_time
            ON ranking_changes(chart, changed_at DESC);
        """
    )
    return connection


def _latest_snapshot(connection: sqlite3.Connection, source: str, chart: str):
    return connection.execute(
        """
        SELECT id, captured_at FROM ranking_snapshots
        WHERE source=? AND chart=? ORDER BY captured_at DESC LIMIT 1
        """,
        (source, chart),
    ).fetchone()


def _snapshot_due(
    connection: sqlite3.Connection,
    source: str,
    chart: str,
    interval: timedelta,
    now: datetime,
) -> bool:
    latest = _latest_snapshot(connection, source, chart)
    if not latest:
        return True
    captured_at = datetime.fromisoformat(latest["captured_at"])
    return now - captured_at >= interval


def _store_snapshot(connection: sqlite3.Connection, result: RankingFetchResult) -> int:
    captured_at = datetime.now(timezone.utc).isoformat()
    previous = _latest_snapshot(connection, result.source, result.chart)
    previous_ranks = {}
    if previous:
        previous_ranks = {
            row["model"]: row["rank"]
            for row in connection.execute(
                "SELECT rank, model FROM ranking_items WHERE snapshot_id=?",
                (previous["id"],),
            )
        }

    cursor = connection.execute(
        """
        INSERT INTO ranking_snapshots (source, chart, source_url, captured_at)
        VALUES (?, ?, ?, ?)
        """,
        (result.source, result.chart, result.source_url, captured_at),
    )
    snapshot_id = int(cursor.lastrowid)
    for item in result.items:
        connection.execute(
            """
            INSERT INTO ranking_items (
                snapshot_id, rank, model, score, model_id, provider, tokens, change_value
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                snapshot_id,
                item["rank"],
                item["model"],
                item.get("score"),
                item.get("modelId"),
                item.get("provider"),
                item.get("tokens"),
                item.get("change"),
            ),
        )
        if result.source != "artificial-analysis" or not previous:
            continue
        previous_rank = previous_ranks.get(item["model"])
        current_rank = item["rank"]
        if previous_rank == current_rank:
            continue
        connection.execute(
            """
            INSERT INTO ranking_changes (
                snapshot_id, chart, model, previous_rank, current_rank, rank_delta, changed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                snapshot_id,
                result.chart,
                item["model"],
                previous_rank,
                current_rank,
                previous_rank - current_rank if previous_rank is not None else None,
                captured_at,
            ),
        )
    connection.commit()
    return snapshot_id


def refresh_model_rankings(force: bool = False) -> Dict[str, Any]:
    results: Dict[str, Any] = {"updated": [], "skipped": [], "errors": {}}
    now = datetime.now(timezone.utc)
    with _refresh_lock:
        connection = _connect()
        try:
            for chart in ARTIFICIAL_ANALYSIS_CHARTS:
                if not force and not _snapshot_due(
                    connection,
                    "artificial-analysis",
                    chart,
                    ARTIFICIAL_ANALYSIS_REFRESH,
                    now,
                ):
                    results["skipped"].append(chart)
                    continue
                try:
                    _store_snapshot(connection, fetch_artificial_analysis(chart))
                    results["updated"].append(chart)
                except (requests.RequestException, ValueError, sqlite3.Error) as exc:
                    results["errors"][chart] = str(exc)

            chart = "weekly-usage"
            if force or _snapshot_due(
                connection, "openrouter", chart, OPENROUTER_REFRESH, now
            ):
                try:
                    _store_snapshot(connection, fetch_openrouter())
                    results["updated"].append(chart)
                except (requests.RequestException, ValueError, sqlite3.Error) as exc:
                    results["errors"][chart] = str(exc)
            else:
                results["skipped"].append(chart)
        finally:
            connection.close()
    return results


def _ranking_items(connection: sqlite3.Connection, snapshot_id: int) -> List[Dict[str, Any]]:
    rows = connection.execute(
        """
        SELECT rank, model, score, model_id, provider, tokens, change_value
        FROM ranking_items WHERE snapshot_id=? ORDER BY rank
        """,
        (snapshot_id,),
    ).fetchall()
    return [
        {
            "rank": row["rank"],
            "model": row["model"],
            "score": row["score"],
            "modelId": row["model_id"],
            "provider": row["provider"],
            "tokens": row["tokens"],
            "change": row["change_value"],
        }
        for row in rows
    ]


def _ranking_items_with_changes(
    connection: sqlite3.Connection,
    source: str,
    chart: str,
    snapshot_id: int,
) -> List[Dict[str, Any]]:
    items = _ranking_items(connection, snapshot_id)
    previous = connection.execute(
        """
        SELECT id FROM ranking_snapshots
        WHERE source=? AND chart=? AND id<>?
        ORDER BY captured_at DESC LIMIT 1
        """,
        (source, chart, snapshot_id),
    ).fetchone()
    if not previous:
        return items
    previous_ranks = {
        row["model"]: row["rank"]
        for row in connection.execute(
            "SELECT model, rank FROM ranking_items WHERE snapshot_id=?",
            (previous["id"],),
        )
    }
    for item in items:
        previous_rank = previous_ranks.get(item["model"])
        item["previousRank"] = previous_rank
        item["rankChange"] = (
            previous_rank - item["rank"] if previous_rank is not None else None
        )
    return items


def get_model_rankings() -> Dict[str, Any]:
    connection = _connect()
    try:
        charts = []
        for chart, config in ARTIFICIAL_ANALYSIS_CHARTS.items():
            snapshot = _latest_snapshot(connection, "artificial-analysis", chart)
            charts.append(
                {
                    "id": chart,
                    "name": config["name"],
                    "source": "Artificial Analysis",
                    "sourceUrl": config["url"],
                    "embedUrl": config["url"],
                    "updatedAt": snapshot["captured_at"] if snapshot else None,
                    "items": (
                        _ranking_items_with_changes(
                            connection,
                            "artificial-analysis",
                            chart,
                            snapshot["id"],
                        )
                        if snapshot
                        else []
                    ),
                }
            )

        openrouter_snapshot = _latest_snapshot(connection, "openrouter", "weekly-usage")
        changes = [
            {
                "id": row["id"],
                "chart": row["chart"],
                "model": row["model"],
                "previousRank": row["previous_rank"],
                "currentRank": row["current_rank"],
                "rankDelta": row["rank_delta"],
                "changedAt": row["changed_at"],
            }
            for row in connection.execute(
                """
                SELECT id, chart, model, previous_rank, current_rank, rank_delta, changed_at
                FROM ranking_changes ORDER BY changed_at DESC, id DESC LIMIT 60
                """
            )
        ]
        return {
            "charts": charts,
            "openrouter": {
                "name": "OpenRouter 周榜",
                "sourceUrl": OPENROUTER_URL,
                "embeddable": False,
                "updatedAt": (
                    openrouter_snapshot["captured_at"] if openrouter_snapshot else None
                ),
                "items": (
                    _ranking_items(connection, openrouter_snapshot["id"])
                    if openrouter_snapshot
                    else []
                ),
            },
            "changes": changes,
            "refresh": {"openrouterHours": 1, "artificialAnalysisHours": 12},
        }
    finally:
        connection.close()