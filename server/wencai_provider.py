from __future__ import annotations

import re
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import pandas as pd


_REPO_PYWENCAI_PATH = Path("/proj/stock_test/pywencai")
if _REPO_PYWENCAI_PATH.exists():
    p = str(_REPO_PYWENCAI_PATH)
    if p not in sys.path:
        sys.path.insert(0, p)

try:
    import pywencai  # type: ignore
except Exception:
    pywencai = None


def is_available() -> bool:
    return pywencai is not None


def _extract_hk_code(q: str) -> Optional[str]:
    q = (q or "").strip().upper()
    m = re.search(r"(\d{1,5})\.HK", q)
    if m:
        return m.group(1).zfill(4)
    m2 = re.search(r"\b(\d{1,5})\b", q)
    if m2:
        return m2.group(1).zfill(4)
    return None


def _to_symbol_from_code(raw_code: str) -> Optional[str]:
    code = str(raw_code or "").strip().upper()
    m = re.fullmatch(r"(\d{1,5})\.HK", code)
    if m:
        return f"{m.group(1).zfill(4)}.HK"
    m2 = re.fullmatch(r"\d{1,5}", code)
    if m2:
        return f"{m2.group(0).zfill(4)}.HK"
    return None


def _extract_rows_from_detail_dict(data: Dict[str, Any]) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []

    def push_from_df(df: Any):
        if isinstance(df, pd.DataFrame) and (not df.empty):
            cols = set(str(c) for c in df.columns)
            if ("股票代码" in cols) and ("股票简称" in cols):
                for _, r in df.iterrows():
                    rows.append(
                        {
                            "股票代码": r.get("股票代码"),
                            "股票简称": r.get("股票简称"),
                        }
                    )

    for v in data.values():
        push_from_df(v)
        if isinstance(v, dict):
            for sv in v.values():
                push_from_df(sv)

    # Fallback: parse txt1 e.g. "腾讯控股(0700.HK)当前最新股价为..."
    txt = str(data.get("txt1") or "")
    m = re.search(r"([\u4e00-\u9fa5A-Za-z0-9\-·\s]+)\((\d{1,5}\.HK)\)", txt)
    if m:
        rows.append({"股票代码": m.group(2), "股票简称": m.group(1).strip()})

    return rows


def _safe_float(v: Any) -> Optional[float]:
    try:
        if v is None:
            return None
        s = str(v).strip()
        if not s or s == "--":
            return None
        return float(s)
    except Exception:
        return None


def _pick_col(row: pd.Series, prefix: str) -> Any:
    for c in row.index:
        if str(c).startswith(prefix):
            return row.get(c)
    return None


def search_hk(query: str, limit: int = 10) -> List[Dict[str, Any]]:
    if not is_available():
        return []
    q = (query or "").strip()
    if not q:
        return []

    df = None
    code = _extract_hk_code(q)

    if code:
        # 代码输入优先，命中最稳
        symbol4 = f"{code}.HK"
        try:
            df = pywencai.get(query="最新价", query_type="hkstock", find=symbol4, retry=2, sleep=0)  # type: ignore[attr-defined]
        except Exception:
            df = None

    detail_rows: List[Dict[str, Any]] = []

    if df is None:
        for question in (f"港股 {q} 最新价", f"{q} 港股 当前最新股价", f"{q} 港股 实时行情"):
            try:
                data = pywencai.get(query=question, query_type="hkstock", retry=2, sleep=0)  # type: ignore[attr-defined]
                if isinstance(data, pd.DataFrame) and not data.empty:
                    df = data
                    break
                if isinstance(data, dict):
                    detail_rows = _extract_rows_from_detail_dict(data)
                    if detail_rows:
                        break
            except Exception:
                continue

    if not isinstance(df, pd.DataFrame) or df.empty:
        if not detail_rows:
            return []
        df = pd.DataFrame(detail_rows)

    items: List[Dict[str, Any]] = []
    seen = set()
    for _, row in df.head(max(1, limit * 4)).iterrows():
        raw_code = row.get("股票代码")
        symbol = _to_symbol_from_code(raw_code)
        if not symbol or symbol in seen:
            continue
        seen.add(symbol)
        stock_code = symbol.split(".")[0].zfill(5)
        name = str(row.get("股票简称") or stock_code)
        items.append(
            {
                "symbol": symbol,
                "cn_name": name,
                "name": name,
                "market": "HK",
                "exchange": "HK",
                "type": "Equity",
                "stock_code": stock_code,
                "source": "wencai",
            }
        )
        if len(items) >= limit:
            break

    return items


@dataclass
class WencaiQuote:
    symbol: str
    price: Optional[float]
    prev_close: Optional[float]
    change: Optional[float]
    pct_change: Optional[float]
    open_price: Optional[float]
    high_price: Optional[float]
    low_price: Optional[float]

    def to_api_dict(self) -> Dict[str, Any]:
        return {
            "symbol": self.symbol,
            "price": self.price,
            "prevClose": self.prev_close,
            "previousClose": self.prev_close,
            "change": self.change,
            "pctChange": self.pct_change,
            "currency": "HKD",
            "exchangeName": "HK",
            "regularMarketTime": None,
            "calcSource": "wencai",
            # 附加字段，便于排查来源数据
            "wencaiOpen": self.open_price,
            "wencaiHigh": self.high_price,
            "wencaiLow": self.low_price,
        }


def fetch_kline_bars(symbol: str) -> List[List[float]]:
    """Build a minimal OHLC bar from Wencai-only fields.

    Wencai detail payload does not provide stable historical OHLC arrays in this
    project context, so caifutong mode returns a single latest bar to avoid
    mixing any non-Wencai source.
    """
    q = fetch_quote(symbol)
    if q is None or q.price is None:
        return []

    o = q.open_price if q.open_price is not None else q.price
    h = q.high_price if q.high_price is not None else q.price
    l = q.low_price if q.low_price is not None else q.price
    c = q.price
    ts_ms = datetime.utcnow().timestamp() * 1000.0
    return [[ts_ms, float(o), float(c), float(l), float(h), 0]]


def fetch_quote(symbol: str) -> Optional[WencaiQuote]:
    if not is_available():
        return None

    sym = (symbol or "").strip().upper()
    code = _extract_hk_code(sym)
    if not code:
        return None
    symbol4 = f"{code}.HK"

    price = None
    pct_change = None
    open_price = None
    high_price = None
    low_price = None

    # 1) 优先从详情语句提取“当前最新股价”和涨跌幅
    try:
        detail = pywencai.get(query=f"{symbol4} 当前最新股价", query_type="hkstock", retry=2, sleep=0)  # type: ignore[attr-defined]
        if isinstance(detail, dict):
            txt = str(detail.get("txt1") or "")
            m_price = re.search(r"最新股价为([0-9]+(?:\.[0-9]+)?)港元", txt)
            m_chg = re.search(r"(上涨|下跌)<span[^>]*>([0-9]+(?:\.[0-9]+)?)%", txt)
            if m_price:
                price = _safe_float(m_price.group(1))
            if m_chg:
                sign = 1.0 if m_chg.group(1) == "上涨" else -1.0
                pct_v = _safe_float(m_chg.group(2))
                pct_change = sign * pct_v if pct_v is not None else None
    except Exception:
        pass

    # 2) 用表格语句补齐开高低与涨跌幅
    try:
        table = pywencai.get(query="最新价", query_type="hkstock", find=symbol4, retry=2, sleep=0)  # type: ignore[attr-defined]
        if isinstance(table, pd.DataFrame) and not table.empty and "股票代码" in table.columns:
            m = table[table["股票代码"].astype(str).str.upper() == symbol4]
            if not m.empty:
                row = m.iloc[0]
                table_price = _safe_float(_pick_col(row, "港股@收盘价"))
                table_pct = _safe_float(_pick_col(row, "港股@最新涨跌幅"))
                open_price = _safe_float(_pick_col(row, "港股@开盘价"))
                high_price = _safe_float(_pick_col(row, "港股@最高价"))
                low_price = _safe_float(_pick_col(row, "港股@最低价"))
                if price is None:
                    price = table_price
                if pct_change is None:
                    pct_change = table_pct
    except Exception:
        pass

    if price is None and pct_change is None:
        return None

    prev_close = None
    change = None
    if price is not None and pct_change is not None:
        prev_close = price / (1.0 + pct_change / 100.0) if (1.0 + pct_change / 100.0) != 0 else None
        if prev_close is not None:
            change = price - prev_close

    return WencaiQuote(
        symbol=symbol4,
        price=price,
        prev_close=prev_close,
        change=change,
        pct_change=pct_change,
        open_price=open_price,
        high_price=high_price,
        low_price=low_price,
    )
