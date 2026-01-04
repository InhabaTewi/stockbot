from stock_sdk import StockClient,SDKConfig,DecodoAuth,ProxyPool
cfg = SDKConfig(
    decodo=DecodoAuth(
        username="sp40emzvtw",
        password_urlencoded="Usdu1w%3DijbPa5a4H2R",
    ),
    proxy_pools=[
        ProxyPool("fr.decodo.com", [40001, 40002, 40003, 40004, 40005]),
        ProxyPool("au.decodo.com", [30001, 30002, 30003, 30004, 30005]),
    ],
    cache_ttl_s=120,
)

c = StockClient(cfg)

symbols = ["0700.HK", "9988.HK", "1810.HK"]
print(c.hk_latest_closes(symbols))

df = c.hk_kline("9988.HK", interval="1d", range_="10d")
print(df.tail())
