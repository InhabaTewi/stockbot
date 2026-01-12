from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import requests

try:
    from zoneinfo import ZoneInfo  # py>=3.9
except Exception:  # pragma: no cover
    ZoneInfo = None  # type: ignore


_TENCENT_QT_URL = "https://qt.gtimg.cn/q="
_TENCENT_MINUTE_URL = "https://web.ifzq.gtimg.cn/appstock/app/minute/query"

_DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0",
    "Accept": "*/*",
}


@dataclass(frozen=True)
class TencentQuote:
    code: str
    name: str
    price: Optional[float]
    prev_close: Optional[float]
    change: Optional[float]
    pct_change: Optional[float]
    quote_time: Optional[str]
    currency: Optional[str]

    def to_api_dict(self) -> Dict[str, Any]:
        return {
            "price": self.price,
            "prevClose": self.prev_close,
            "change": self.change,
            "pctChange": self.pct_change,
            "currency": self.currency,
            "regularMarketTime": self.quote_time,
            "calcSource": "tencent",
        }


def _session(timeout_s: int) -> Tuple[requests.Session, int]:
    s = requests.Session()
    # IMPORTANT: avoid any environment proxy vars breaking outbound calls
    s.trust_env = False
    s.headers.update(_DEFAULT_HEADERS)
    return s, timeout_s


def to_tencent_code(symbol: str) -> Optional[str]:
    """Convert symbol into Tencent code.

    Supported:
      - HK: "00700.HK" / "700.HK" / "hk00700" -> "hk00700"
      - CN (best-effort): "600000" -> None (ambiguous)

    This project primarily uses HK symbols.
    """

    s = (symbol or "").strip()
    if not s:
        return None

    if s.startswith("hk") and len(s) >= 4:
        return s

    # Yahoo-style HK symbol: 00700.HK or 700.HK
    m = re.fullmatch(r"(\d{1,5})\.HK", s, flags=re.IGNORECASE)
    if m:
        code = m.group(1).zfill(5)
        return f"hk{code}"

    # raw hk code: 00700 / 700
    if s.isdigit() and len(s) <= 5:
        code = s.zfill(5)
        return f"hk{code}"

    return None


def _safe_float(v: str) -> Optional[float]:
    try:
        if v is None:
            return None
        vv = str(v).strip()
        if not vv or vv.lower() in {"nan", "null"}:
            return None
        return float(vv)
    except Exception:
        return None


def _calc_change(price: Optional[float], prev: Optional[float]) -> Tuple[Optional[float], Optional[float]]:
    if price is None or prev in (None, 0):
        return None, None
    change = price - prev
    pct = change / prev * 100.0
    return float(change), float(pct)


def fetch_quote(symbol: str, timeout_s: int = 10) -> TencentQuote:
    """Fetch real-time quote using Tencent qt endpoint."""

    code = to_tencent_code(symbol)
    if not code:
        raise ValueError(f"Unsupported symbol for Tencent: {symbol}")

    s, timeout_s = _session(timeout_s)
    url = f"{_TENCENT_QT_URL}{code}"
    r = s.get(url, timeout=timeout_s)
    # Response is GBK text like: v_hk00700="100~name~00700~price~prev~open~...~date time~...~HKD~...";
    text = r.text

    m = re.search(r"=\"(.*)\";?", text)
    if not m:
        raise ValueError(f"Unexpected qt response: {text[:200]}")

    parts = m.group(1).split("~")

    name = parts[1] if len(parts) > 1 else ""
    raw_code = parts[2] if len(parts) > 2 else ""
    price = _safe_float(parts[3]) if len(parts) > 3 else None
    prev_close = _safe_float(parts[4]) if len(parts) > 4 else None

    change, pct = _calc_change(price, prev_close)

    quote_time = parts[30] if len(parts) > 30 else None

    currency = None
    # tail often contains HKD
    for p in reversed(parts[-6:]):
        if p in {"HKD", "USD", "CNY"}:
            currency = p
            break

    return TencentQuote(
        code=raw_code or code,
        name=name,
        price=price,
        prev_close=prev_close,
        change=change,
        pct_change=pct,
        quote_time=quote_time,
        currency=currency,
    )


def fetch_intraday_minute_bars(symbol: str, timeout_s: int = 12) -> List[List[float]]:
    """Fetch intraday minute data and convert into bars format used by /api/kline.

    Returns bars: [ms, open, close, low, high, volume]

    Tencent minute/query returns cumulative volume/amount at each minute.
    We convert to per-minute volume by delta.
    """

    code = to_tencent_code(symbol)
    if not code:
        raise ValueError(f"Unsupported symbol for Tencent: {symbol}")

    s, timeout_s = _session(timeout_s)
    r = s.get(_TENCENT_MINUTE_URL, params={"code": code}, timeout=timeout_s)
    obj = r.json()

    data0 = ((obj.get("data") or {}).get(code) or {}).get("data") or {}
    date_str = str(data0.get("date") or "")  # yyyymmdd
    rows = data0.get("data") or []

    if not date_str or len(date_str) != 8 or not rows:
        return []

    yyyy = int(date_str[0:4])
    mm = int(date_str[4:6])
    dd = int(date_str[6:8])

    tz = None
    if ZoneInfo is not None:
        try:
            tz = ZoneInfo("Asia/Hong_Kong")
        except Exception:
            tz = None

    bars: List[List[float]] = []
    prev_cum_vol: Optional[float] = None

    for line in rows:
        # format: "HHMM price cumVol cumAmount"
        parts = str(line).strip().split()
        if len(parts) < 3:
            continue

        hhmm = parts[0]
        if len(hhmm) != 4 or not hhmm.isdigit():
            continue
        hh = int(hhmm[0:2])
        mi = int(hhmm[2:4])

        price = _safe_float(parts[1])
        cum_vol = _safe_float(parts[2])

        if price is None:
            continue

        # convert to epoch ms
        dt = datetime(yyyy, mm, dd, hh, mi, 0, tzinfo=tz) if tz else datetime(yyyy, mm, dd, hh, mi, 0)
        ts_ms = dt.timestamp() * 1000.0

        vol = 0
        if cum_vol is not None:
            if prev_cum_vol is not None:
                vol = int(max(0.0, float(cum_vol - prev_cum_vol)))
            prev_cum_vol = cum_vol

        # We only have a single price point per minute; represent as flat bar.
        o = c = l = h = float(price)
        bars.append([ts_ms, o, c, l, h, vol])

    return bars
