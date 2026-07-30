import React, { useEffect, useState } from "react";
import { apiGet, apiPost } from "../services/api";

function formatPublishedAt(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function ArticleMessage({ article }) {
  return (
    <li>
      <a href={article.url} target="_blank" rel="noreferrer">
        <strong>{article.summary || article.title}</strong>
        <span>
          {[article.source, formatPublishedAt(article.published_at)].filter(Boolean).join(" · ") || "查看原文"}
        </span>
      </a>
    </li>
  );
}

function MessageColumn({ tone, title, articles }) {
  return (
    <div className={`news-message-column is-${tone}`}>
      <div className="news-message-heading">
        <span className="news-tone-dot" aria-hidden="true" />
        {title}
        <span className="news-column-count">{articles.length}</span>
      </div>
      {articles.length ? (
        <ul className="news-message-list">
          {articles.map((article) => <ArticleMessage key={article.id || article.url} article={article} />)}
        </ul>
      ) : <div className="news-column-empty">暂无相关资讯</div>}
    </div>
  );
}

function StockNewsCard({ stock }) {
  return (
    <article className="news-stock-card">
      <header className="news-stock-header">
        <div>
          <h4>{stock.name}</h4>
          <p>{stock.description} · {stock.articleCount} 条已审核资讯</p>
        </div>
        <span className="news-symbol">{stock.symbol}</span>
      </header>
      <div className="news-message-grid">
        <MessageColumn tone="positive" title="利好消息" articles={stock.positive || []} />
        <MessageColumn tone="negative" title="风险关注" articles={stock.negative || []} />
      </div>
      {stock.neutral?.length ? (
        <div className="news-neutral-row">
          <strong>其他动态</strong>
          <ul>
            {stock.neutral.map((article) => <ArticleMessage key={article.id || article.url} article={article} />)}
          </ul>
        </div>
      ) : null}
    </article>
  );
}

function formatRankingTime(value) {
  if (!value) return "等待首次采集";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatTokens(value) {
  if (!Number.isFinite(value)) return "--";
  if (value >= 1e12) return `${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  return new Intl.NumberFormat("zh-CN").format(value);
}

function RankChange({ value, previousRank }) {
  if (previousRank == null) return <span className="model-rank-change is-new">新</span>;
  if (!value) return <span className="model-rank-change is-flat">-</span>;
  return (
    <span className={`model-rank-change ${value > 0 ? "is-up" : "is-down"}`}>
      {value > 0 ? "↑" : "↓"}{Math.abs(value)}
    </span>
  );
}

function CompactRankingChart({ chart }) {
  const items = (chart?.items || []).slice(0, 12);
  const maxScore = Math.max(...items.map((item) => item.score || 0), 1);
  return (
    <div className="model-ranking-bars">
      {items.map((item) => (
        <div className="model-ranking-bar-row" key={item.model}>
          <span className="model-rank-number">{item.rank}</span>
          <div className="model-ranking-model" title={item.model}>{item.model}</div>
          <div className="model-ranking-track" aria-hidden="true">
            <span style={{ width: `${Math.max((item.score / maxScore) * 100, 3)}%` }} />
          </div>
          <strong>{item.score.toFixed(1)}</strong>
          <RankChange value={item.rankChange} previousRank={item.previousRank} />
        </div>
      ))}
    </div>
  );
}

function ModelRankings({ payload, loading, error, refreshing, onRefresh }) {
  const [chartId, setChartId] = useState("intelligence");
  const charts = payload?.charts || [];
  const activeChart = charts.find((chart) => chart.id === chartId) || charts[0];
  const changes = (payload?.changes || []).filter((change) => change.chart === activeChart?.id);

  if (loading && !payload) return <div className="model-ranking-state">正在获取世界大模型排名...</div>;
  if (error && !payload) return <div className="model-ranking-state is-error">{error}</div>;

  return (
    <div className="model-rankings-page">
      <div className="model-rankings-toolbar">
        <div>
          <span>GLOBAL MODEL INDEX</span>
          <h3>世界大模型排名</h3>
          <p>OpenRouter 每小时更新；Artificial Analysis 每 12 小时采集并记录排名变化。</p>
        </div>
        <button type="button" onClick={onRefresh} disabled={refreshing}>
          {refreshing ? "更新中..." : "立即更新"}
        </button>
      </div>

      <div className="model-source-tabs" role="tablist" aria-label="Artificial Analysis 榜单">
        {charts.map((chart) => (
          <button
            key={chart.id}
            type="button"
            role="tab"
            aria-selected={activeChart?.id === chart.id}
            className={activeChart?.id === chart.id ? "active" : ""}
            onClick={() => setChartId(chart.id)}
          >
            <strong>{chart.name}</strong>
            <span>{formatRankingTime(chart.updatedAt)}</span>
          </button>
        ))}
      </div>

      {activeChart ? (
        <div className="model-ranking-local-grid">
          <section className="model-ranking-panel">
            <div className="model-ranking-panel-heading">
              <div><span>本地快照</span><h4>{activeChart.name} Top 12</h4></div>
              <a href={activeChart.sourceUrl} target="_blank" rel="noreferrer">查看数据源 ↗</a>
            </div>
            <CompactRankingChart chart={activeChart} />
          </section>
          <aside className="model-ranking-panel model-change-panel">
            <div className="model-ranking-panel-heading">
              <div><span>RANK MOVEMENT</span><h4>排名变化</h4></div>
            </div>
            {changes.length ? (
              <ul>
                {changes.slice(0, 12).map((change) => (
                  <li key={change.id}>
                    <div><strong>{change.model}</strong><span>{change.previousRank ? `第 ${change.previousRank} 位 → 第 ${change.currentRank} 位` : `新进入第 ${change.currentRank} 位`}</span></div>
                    <RankChange value={change.rankDelta} previousRank={change.previousRank} />
                  </li>
                ))}
              </ul>
            ) : <div className="model-change-empty">当前暂无排名变化，下一次快照后自动比对。</div>}
          </aside>
        </div>
      ) : null}

      {activeChart ? (
        <section className="model-ranking-embed">
          <div className="model-ranking-panel-heading">
            <div><span>LIVE SOURCE</span><h4>Artificial Analysis 原始图表</h4></div>
            <span>交互内容由来源网站直接提供</span>
          </div>
          <div className="model-ranking-embed-viewport">
            <iframe
              key={activeChart.id}
              src={activeChart.embedUrl}
              title={`Artificial Analysis ${activeChart.name}`}
              loading="lazy"
            />
          </div>
        </section>
      ) : null}

      <section className="model-ranking-panel openrouter-panel">
        <div className="model-ranking-panel-heading">
          <div><span>WEEKLY TOKEN USAGE</span><h4>{payload?.openrouter?.name || "OpenRouter 周榜"}</h4></div>
          <div className="model-ranking-source-meta">
            <span>{formatRankingTime(payload?.openrouter?.updatedAt)}</span>
            <a href={payload?.openrouter?.sourceUrl} target="_blank" rel="noreferrer">打开原榜 ↗</a>
          </div>
        </div>
        <div className="openrouter-table-wrap">
          <table>
            <thead><tr><th>排名</th><th>模型</th><th>提供方</th><th>周 Token</th><th>周变化</th></tr></thead>
            <tbody>
              {(payload?.openrouter?.items || []).map((item) => (
                <tr key={item.modelId || item.model}>
                  <td><strong>{item.rank}</strong></td>
                  <td>{item.model}</td>
                  <td>{item.provider}</td>
                  <td>{formatTokens(item.tokens)}</td>
                  <td className={item.change > 0 ? "is-positive" : item.change < 0 ? "is-negative" : ""}>
                    {item.change == null ? "新" : `${item.change > 0 ? "+" : ""}${(item.change * 100).toFixed(0)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default function NewsPage() {
  const [payload, setPayload] = useState(null);
  const [rankingPayload, setRankingPayload] = useState(null);
  const [rankingError, setRankingError] = useState("");
  const [rankingLoading, setRankingLoading] = useState(true);
  const [rankingRefreshing, setRankingRefreshing] = useState(false);
  const [dependencies, setDependencies] = useState(null);
  const [error, setError] = useState("");
  const [marketId, setMarketId] = useState("hk");
  const [sectorId, setSectorId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([apiGet("/api/news"), apiGet("/api/news/admin/settings")])
      .then(([newsData, settingsData]) => {
        if (cancelled) return;
        setPayload(newsData);
        setDependencies(settingsData.dependencies || null);
      })
      .catch((requestError) => {
        if (!cancelled) setError(requestError.message || "资讯加载失败");
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadRankings = () => {
      apiGet("/api/news/model-rankings")
        .then((data) => {
          if (cancelled) return;
          setRankingPayload(data);
          setRankingError("");
        })
        .catch((requestError) => {
          if (!cancelled) setRankingError(requestError.message || "排名加载失败");
        })
        .finally(() => {
          if (!cancelled) setRankingLoading(false);
        });
    };
    loadRankings();
    const timer = window.setInterval(loadRankings, 60 * 60 * 1000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  const refreshRankings = () => {
    setRankingRefreshing(true);
    apiPost("/api/news/model-rankings/refresh")
      .then((result) => {
        setRankingPayload(result.data);
        setRankingError("");
      })
      .catch((requestError) => setRankingError(requestError.message || "排名更新失败"))
      .finally(() => setRankingRefreshing(false));
  };

  if (error) {
    return <section className="news-state glass-card" role="alert"><strong>资讯暂时无法加载</strong><span>{error}</span></section>;
  }
  if (!payload) return <section className="news-state glass-card">正在整理市场资讯...</section>;

  const markets = payload.markets || [];
  const activeMarket = markets.find((market) => market.id === marketId) || markets[0];
  const activeSector = activeMarket?.sectors.find((sector) => sector.id === sectorId) || activeMarket?.sectors[0];
  const unavailable = dependencies
    ? Object.entries(dependencies).filter(([, value]) => !value.ok).map(([name]) => name)
    : [];

  return (
    <section className="news-page" aria-labelledby="news-page-title">
      <header className="news-hero">
        <div>
          <span className="news-kicker">VERIFIED MARKET FEED</span>
          <h3 id="news-page-title">资讯中心</h3>
        </div>
        <span className="news-disclaimer">{payload.meta?.disclaimer}</span>
      </header>

      {unavailable.length ? (
        <div className="news-service-alert" role="status">
          <strong>实时抓取尚未就绪</strong>
          <span>{unavailable.join("、")} 服务不可用，当前仅展示已入库资讯。请在后台查看服务状态。</span>
        </div>
      ) : null}

      <div className="news-market-tabs" role="tablist" aria-label="资讯市场">
        {markets.map((market) => (
          <button
            key={market.id}
            type="button"
            role="tab"
            aria-selected={marketId !== "model-rankings" && activeMarket?.id === market.id}
            className={`news-market-tab ${marketId !== "model-rankings" && activeMarket?.id === market.id ? "active" : ""}`}
            onClick={() => { setMarketId(market.id); setSectorId(null); }}
          >
            <strong>{market.name}</strong>
            <span>{market.sectors.length} 个行业</span>
          </button>
        ))}
        <button
          type="button"
          role="tab"
          aria-selected={marketId === "model-rankings"}
          className={`news-market-tab ${marketId === "model-rankings" ? "active" : ""}`}
          onClick={() => setMarketId("model-rankings")}
        >
          <strong>世界大模型排名</strong>
          <span>4 个榜单</span>
        </button>
      </div>

      {marketId === "model-rankings" ? (
        <ModelRankings
          payload={rankingPayload}
          loading={rankingLoading}
          error={rankingError}
          refreshing={rankingRefreshing}
          onRefresh={refreshRankings}
        />
      ) : activeMarket && activeSector ? (
        <div className="news-workspace">
          <aside className="news-sector-nav" aria-label={`${activeMarket.name}行业栏目`}>
            <div className="news-sector-nav-title">
              <strong>{activeMarket.name}</strong>
              <span>{activeMarket.description}</span>
            </div>
            <div className="news-sector-list">
              {activeMarket.sectors.map((sector) => (
                <button
                  key={sector.id}
                  type="button"
                  className={`news-sector-button ${activeSector.id === sector.id ? "active" : ""}`}
                  onClick={() => setSectorId(sector.id)}
                >
                  <span>{sector.name}</span>
                  <span className="news-sector-count">{sector.stocks.length}</span>
                </button>
              ))}
            </div>
          </aside>

          <main className="news-sector-content">
            <div className="news-sector-heading">
              <div><span>行业栏目</span><h3>{activeSector.name}</h3></div>
              <span>{activeSector.stocks.length} 家公司</span>
            </div>
            <div className="news-stock-list">
              {activeSector.stocks.map((stock) => <StockNewsCard key={stock.symbol} stock={stock} />)}
            </div>
          </main>
        </div>
      ) : null}
    </section>
  );
}