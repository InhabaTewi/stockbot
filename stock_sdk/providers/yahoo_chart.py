from dataclasses import dataclass
from typing import Optional

import pandas as pd

from ..http import ProxyRotator


@dataclass(frozen=True)
class YahooBar:
    ts: int
    open: Optional[float]
    high: Optional[float]
    low: Optional[float]
    close: Optional[float]
    volume: Optional[int]


class YahooChartProvider:
    """
    Uses Yahoo chart JSON endpoint directly (no cookie/crumb).
    """

    def __init__(self, http: ProxyRotator):
        self.http = http

    def fetch_chart(self, symbol: str, interval: str = "1d", range_: str = "10d") -> dict:
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
        params = {"interval": interval, "range": range_}
        return self.http.get_json(url, params)

    def to_dataframe(self, chart_json: dict) -> pd.DataFrame:
        result = chart_json["chart"]["result"][0]
        ts = result.get("timestamp") or []
        quote = result["indicators"]["quote"][0]
        df = pd.DataFrame({
            "Open": quote.get("open"),
            "High": quote.get("high"),
            "Low": quote.get("low"),
            "Close": quote.get("close"),
            "Volume": quote.get("volume"),
        }, index=pd.to_datetime(ts, unit="s"))
        return df

    def latest_close(self, symbol: str, interval: str = "1d", range_: str = "10d") -> float:
        cj = self.fetch_chart(symbol, interval=interval, range_=range_)
        result = cj["chart"]["result"][0]
        closes = result["indicators"]["quote"][0]["close"]
        for v in reversed(closes):
            if v is not None:
                return float(v)
        raise ValueError(f"No close for {symbol}")