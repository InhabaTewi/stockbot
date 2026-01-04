from dataclasses import dataclass
from typing import List, Optional


@dataclass(frozen=True)
class ProxyPool:
    """One proxy endpoint with a list of ports."""
    host: str
    ports: List[int]


@dataclass(frozen=True)
class DecodoAuth:
    username: str
    password_urlencoded: str  # IMPORTANT: URL-encoded password (e.g. '=' -> %3D)


@dataclass(frozen=True)
class RetryPolicy:
    timeout_s: int = 25
    max_attempts_per_port: int = 1
    sleep_between_ports_s: float = 0.8
    backoff_on_error_s: float = 2.0


@dataclass(frozen=True)
class YahooChartConfig:
    user_agent: str = "Mozilla/5.0"
    accept: str = "application/json,text/plain,*/*"


@dataclass(frozen=True)
class SDKConfig:
    decodo: DecodoAuth
    proxy_pools: List[ProxyPool]
    retry: RetryPolicy = RetryPolicy()
    yahoo: YahooChartConfig = YahooChartConfig()
    remember_last_good: bool = True
    # simple in-memory ttl cache for chart JSON
    cache_ttl_s: int = 120
