import time
from dataclasses import dataclass
from typing import Dict, Optional, Tuple

import requests

from .config import DecodoAuth, RetryPolicy, YahooChartConfig, ProxyPool
from .errors import ProxyAllFailed, UpstreamBlocked, UpstreamBadGateway


@dataclass
class _TTLCache:
    ttl_s: int
    store: Dict[Tuple[str, Tuple[Tuple[str, str], ...]], Tuple[float, dict]]

    def get(self, key):
        v = self.store.get(key)
        if not v:
            return None
        ts, data = v
        if time.time() - ts > self.ttl_s:
            self.store.pop(key, None)
            return None
        return data

    def set(self, key, data):
        self.store[key] = (time.time(), data)


class ProxyRotator:
    """
    Try (host,port) candidates until upstream returns JSON 200.
    Remembers last good route if enabled.
    """

    def __init__(
        self,
        auth: DecodoAuth,
        pools: list[ProxyPool],
        retry: RetryPolicy,
        headers_cfg: YahooChartConfig,
        remember_last_good: bool = True,
        cache_ttl_s: int = 120,
    ):
        self.auth = auth
        self.pools = pools
        self.retry = retry
        self.headers_cfg = headers_cfg
        self.remember_last_good = remember_last_good
        self._last_good: Optional[Tuple[str, int]] = None
        self._cache = _TTLCache(ttl_s=cache_ttl_s, store={})

    def _proxy_url(self, host: str, port: int) -> str:
        return f"http://{self.auth.username}:{self.auth.password_urlencoded}@{host}:{port}"

    def _session(self, host: str, port: int) -> requests.Session:
        p = self._proxy_url(host, port)
        s = requests.Session()
        s.proxies.update({"http": p, "https": p})
        s.headers.update({
            "User-Agent": self.headers_cfg.user_agent,
            "Accept": self.headers_cfg.accept,
        })
        return s

    def get_json(self, url: str, params: dict) -> dict:
        # cache key: url + sorted params
        key = (url, tuple(sorted((k, str(v)) for k, v in params.items())))
        cached = self._cache.get(key)
        if cached is not None:
            return cached

        ordered: list[Tuple[str, list[int]]] = []
        if self.remember_last_good and self._last_good:
            h, p = self._last_good
            ordered.append((h, [p]))
        for pool in self.pools:
            ordered.append((pool.host, pool.ports))

        last_err: Optional[Exception] = None

        for host, ports in ordered:
            for port in ports:
                for _attempt in range(self.retry.max_attempts_per_port):
                    s = self._session(host, port)
                    try:
                        r = s.get(url, params=params, timeout=self.retry.timeout_s)
                        ctype = (r.headers.get("content-type") or "").lower()

                        # common blocked patterns: 429, html, empty
                        if r.status_code == 429 or "text/html" in ctype:
                            raise UpstreamBlocked(f"{r.status_code} {ctype}")
                        if r.status_code >= 500:
                            raise UpstreamBadGateway(f"{r.status_code} {ctype}")
                        if r.status_code != 200 or "json" not in ctype:
                            raise UpstreamBlocked(f"{r.status_code} {ctype}")

                        data = r.json()

                        if self.remember_last_good:
                            self._last_good = (host, port)

                        self._cache.set(key, data)
                        return data

                    except (requests.exceptions.ProxyError,
                            requests.exceptions.SSLError,
                            requests.exceptions.ConnectionError,
                            requests.exceptions.Timeout) as e:
                        # proxy tunnel errors / disconnects
                        last_err = e
                        time.sleep(self.retry.backoff_on_error_s)
                    except (UpstreamBlocked, UpstreamBadGateway, ValueError) as e:
                        last_err = e
                        time.sleep(self.retry.backoff_on_error_s)

                time.sleep(self.retry.sleep_between_ports_s)

        raise ProxyAllFailed(f"All routes failed. last_err={last_err}")
