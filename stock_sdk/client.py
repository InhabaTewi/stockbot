from typing import Dict, List

import pandas as pd

from .config import SDKConfig
from .http import ProxyRotator
from .providers.yahoo_chart import YahooChartProvider


class StockClient:
    """
    Your SDK entrypoint.
    For now:
      - HK: Yahoo Chart API via Decodo proxies
    """

    def __init__(self, cfg: SDKConfig):
        self.cfg = cfg
        self._http = ProxyRotator(
            auth=cfg.decodo,
            pools=cfg.proxy_pools,
            retry=cfg.retry,
            headers_cfg=cfg.yahoo,
            remember_last_good=cfg.remember_last_good,
            cache_ttl_s=cfg.cache_ttl_s,
        )
        self.hk = YahooChartProvider(self._http)

    # convenience wrappers
    def hk_latest_close(self, symbol: str) -> float:
        return self.hk.latest_close(symbol, interval="1d", range_="10d")

    def hk_latest_closes(self, symbols: List[str]) -> Dict[str, float]:
        out = {}
        for s in symbols:
            out[s] = self.hk_latest_close(s)
        return out

    def hk_kline(self, symbol: str, interval: str = "1d", range_: str = "10d") -> pd.DataFrame:
        cj = self.hk.fetch_chart(symbol, interval=interval, range_=range_)
        return self.hk.to_dataframe(cj)
