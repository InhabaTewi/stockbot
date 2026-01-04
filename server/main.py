from __future__ import annotations

import os
import time
from typing import Any, Dict, List, Literal

import pandas as pd
import requests
import mysql.connector
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

# -------------------------
# Load .env (VERY IMPORTANT)
# -------------------------
try:
    from dotenv import load_dotenv  # pip install python-dotenv
    load_dotenv("/proj/.env", override=False)
except Exception:
    pass

app = FastAPI(title="Stock Project API", version="1.0.2")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------------------------
# DB Config
# -------------------------
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", "3306"))
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME = os.getenv("DB_NAME", "stock_data")


def db_conn():
    return mysql.connector.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME,
    )


# -------------------------
# Yahoo / Proxy (可选：仅在拉K线/summary时用)
# -------------------------
DECODO_USER = os.getenv("DECODO_USER", "sp40emzvtw")
DECODO_PASS_ENC = os.getenv("DECODO_PASS_ENC", "Usdu1w%3DijbPa5a4H2R")

PROXY_CANDIDATES = [
    ("fr.decodo.com", [40001, 40002, 40003]),
    ("au.decodo.com", [30001, 30002, 30003]),
]

YAHOO_HEADERS = {
    "User-Agent": "Mozilla/5.0",
    "Accept": "application/json,text/plain,*/*",
}


def mk_proxy(host: str, port: int) -> str:
    return f"http://{DECODO_USER}:{DECODO_PASS_ENC}@{host}:{port}"


def get_json_with_failover(url: str, params: dict, timeout: int = 25) -> dict:
    last_err = None
    for host, ports in PROXY_CANDIDATES:
        for port in ports:
            proxy = mk_proxy(host, port)
            s = requests.Session()
            s.trust_env = False  # 不吃环境代理
            s.proxies.update({"http": proxy, "https": proxy})
            s.headers.update(YAHOO_HEADERS)
            try:
                r = s.get(url, params=params, timeout=timeout)
                ctype = (r.headers.get("content-type") or "").lower()
                if r.status_code == 200 and "json" in ctype:
                    return r.json()
                last_err = RuntimeError(f"Yahoo HTTP {r.status_code} ctype={ctype}")
                time.sleep(0.8)
            except Exception as e:
                last_err = e
                time.sleep(1.0)
    raise RuntimeError(f"all proxies failed, last_err={last_err}")


def yahoo_chart(symbol: str, interval: str, range_: str) -> dict:
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
    return get_json_with_failover(url, {"interval": interval, "range": range_})


# -------------------------
# Helpers
# -------------------------
def hk_to_yahoo_symbol(stock_code: str) -> str:
    # 01810 -> 1810.HK
    return f"{int(stock_code)}.HK"


def resolve_stock_alias_columns(cur) -> Dict[str, str]:
    cur.execute(
        """
        SELECT COLUMN_NAME
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA=%s AND TABLE_NAME='stock_aliases'
        """,
        (DB_NAME,),
    )
    cols = {r[0] for r in cur.fetchall()}

    alias_col = None
    for c in ["alias", "alias_name", "name", "keyword"]:
        if c in cols:
            alias_col = c
            break

    target_col = None
    for c in ["stock_name", "target_name", "canonical_name", "standard", "standard_name", "mapped_name"]:
        if c in cols:
            target_col = c
            break

    if not alias_col:
        raise RuntimeError(f"stock_aliases missing alias column, cols={sorted(cols)}")
    if not target_col:
        raise RuntimeError(f"stock_aliases missing target column, cols={sorted(cols)}")

    return {"alias_col": alias_col, "target_col": target_col}


def db_search_hk(q: str, limit: int = 10) -> List[Dict[str, Any]]:
    q = (q or "").strip()
    if not q:
        return []

    conn = db_conn()
    cur = conn.cursor(dictionary=True)

    try:
        # 1) 代码输入：1810 / 01810
        if q.isdigit():
            cur.execute(
                """
                SELECT stock_code, stock_name, market
                FROM stock_mapping
                WHERE market='HK'
                  AND (stock_code=%s OR stock_code=LPAD(%s,5,'0'))
                LIMIT %s
                """,
                (q, q, limit),
            )
            rows = cur.fetchall()
            if rows:
                return rows

        # 2) 中文名模糊
        cur.execute(
            """
            SELECT stock_code, stock_name, market
            FROM stock_mapping
            WHERE market='HK' AND stock_name LIKE %s
            LIMIT %s
            """,
            (f"%{q}%", limit),
        )
        rows = cur.fetchall()
        if rows:
            return rows

        # 3) alias 增强
        cols = resolve_stock_alias_columns(cur)
        alias_col = cols["alias_col"]
        target_col = cols["target_col"]

        cur.execute(
            f"""
            SELECT DISTINCT {target_col} AS target
            FROM stock_aliases
            WHERE {alias_col} LIKE %s
            LIMIT %s
            """,
            (f"%{q}%", limit),
        )
        alias_rows = cur.fetchall()
        targets = [r["target"] for r in alias_rows if r.get("target")]
        if targets:
            conds = []
            params = []
            for t in targets:
                conds.append("stock_name LIKE %s")
                params.append(f"%{t}%")
            where_like = " OR ".join(conds)
            cur.execute(
                f"""
                SELECT stock_code, stock_name, market
                FROM stock_mapping
                WHERE market='HK' AND ({where_like})
                LIMIT %s
                """,
                (*params, limit),
            )
            return cur.fetchall()

        return []
    finally:
        cur.close()
        conn.close()


def chart_to_ohlcv(chart_json: dict) -> pd.DataFrame:
    r0 = chart_json["chart"]["result"][0]
    ts = r0.get("timestamp") or []
    quote = r0["indicators"]["quote"][0]
    df = pd.DataFrame(
        {
            "Open": quote.get("open"),
            "High": quote.get("high"),
            "Low": quote.get("low"),
            "Close": quote.get("close"),
            "Volume": quote.get("volume"),
        },
        index=pd.to_datetime(ts, unit="s", utc=True),
    )
    df.index.name = "time"
    return df


def _calc_change(price: float | None, prev: float | None) -> tuple[float | None, float | None]:
    """
    返回 (change, pctChange)
    """
    if price is None or prev in (None, 0):
        return None, None
    change = price - prev
    pct = change / prev * 100.0
    return float(change), float(pct)


def latest_price_change_robust(symbol: str) -> dict:
    """
    更稳的 price/change/pctChange：
    1) 优先 meta regularMarketPrice + previousClose
    2) 若 meta 不完整：用 5d 日线的最后两根 Close 计算（休市也能算）
    """
    cj = yahoo_chart(symbol, interval="1d", range_="5d")
    r0 = cj["chart"]["result"][0]
    meta = r0.get("meta") or {}

    price = meta.get("regularMarketPrice")
    prev_close = meta.get("previousClose")

    # meta 有值就直接算
    change, pct = _calc_change(price, prev_close)
    if pct is not None:
        return {
            "price": float(price) if price is not None else None,
            "prevClose": float(prev_close) if prev_close is not None else None,
            "change": change,
            "pctChange": pct,
            "currency": meta.get("currency"),
            "exchangeName": meta.get("exchangeName"),
            "regularMarketTime": meta.get("regularMarketTime"),
            "calcSource": "meta",
        }

    # meta 不全：用 K 线 Close 兜底
    df = chart_to_ohlcv(cj).dropna(subset=["Close"])
    if len(df) >= 2:
        last_close = float(df["Close"].iloc[-1])
        prev_close2 = float(df["Close"].iloc[-2])
        change2, pct2 = _calc_change(last_close, prev_close2)
        return {
            "price": last_close,
            "prevClose": prev_close2,
            "change": change2,
            "pctChange": pct2,
            "currency": meta.get("currency"),
            "exchangeName": meta.get("exchangeName"),
            "regularMarketTime": meta.get("regularMarketTime"),
            "calcSource": "kline_close",
        }

    # 实在不行
    return {
        "price": float(price) if price is not None else None,
        "prevClose": float(prev_close) if prev_close is not None else None,
        "change": None,
        "pctChange": None,
        "currency": meta.get("currency"),
        "exchangeName": meta.get("exchangeName"),
        "regularMarketTime": meta.get("regularMarketTime"),
        "calcSource": "none",
    }


def high_6m_1y(symbol: str) -> dict:
    cj = yahoo_chart(symbol, interval="1d", range_="1y")
    df = chart_to_ohlcv(cj).dropna(subset=["High"])
    if df.empty:
        return {"high6m": None, "high1y": None}

    now = pd.Timestamp.utcnow()
    df6 = df[df.index >= now - pd.Timedelta(days=183)]
    dfy = df[df.index >= now - pd.Timedelta(days=365)]

    return {
        "high6m": float(df6["High"].max()) if not df6.empty else None,
        "high1y": float(dfy["High"].max()) if not dfy.empty else None,
    }


# -------------------------
# Routes
# -------------------------
@app.get("/")
def root():
    return {"ok": True, "docs": "/docs"}


@app.get("/api/search")
def search(q: str = Query(..., min_length=1)):
    rows = db_search_hk(q, limit=10)
    items = []
    for r in rows:
        items.append(
            {
                "symbol": hk_to_yahoo_symbol(r["stock_code"]),
                "cn_name": r["stock_name"],
                "name": r["stock_name"],
                "market": r["market"],
                "exchange": r["market"],
                "type": "Equity",
                "stock_code": r["stock_code"],
            }
        )
    return {"items": items}


TF = Literal["1m", "2m", "5m", "15m", "30m", "60m", "90m", "1d", "1wk", "1mo"]


@app.get("/api/kline")
def kline(symbol: str, tf: TF = "1d", range_: str = Query("3mo", alias="range")):
    cj = yahoo_chart(symbol, interval=tf, range_=range_)
    df = chart_to_ohlcv(cj).dropna(subset=["Open", "High", "Low", "Close"])

    bars = []
    for t, row in df.iterrows():
        bars.append(
            [
                int(t.timestamp() * 1000),
                float(row["Open"]),
                float(row["Close"]),
                float(row["Low"]),
                float(row["High"]),
                int(row["Volume"]) if pd.notna(row["Volume"]) else 0,
            ]
        )
    return {"symbol": symbol, "tf": tf, "range": range_, "bars": bars}


@app.get("/api/summary")
def summary(symbol: str):
    # ✅ 更稳的后端计算
    info = latest_price_change_robust(symbol)
    highs = high_6m_1y(symbol)
    return {"symbol": symbol, **info, **highs}
