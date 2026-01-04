class StockSDKError(Exception):
    """Base error for stock_sdk."""


class ProxyAllFailed(StockSDKError):
    """All proxies failed / no usable route."""


class UpstreamBlocked(StockSDKError):
    """Upstream blocked (429/HTML) or not JSON."""


class UpstreamBadGateway(StockSDKError):
    """Proxy / gateway issues like 502, disconnects."""
