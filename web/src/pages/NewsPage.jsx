import React, { useEffect, useState } from "react";
import { apiGet } from "../services/api";

function MessageColumn({ tone, title, messages }) {
  return (
    <div className={`news-message-column is-${tone}`}>
      <div className="news-message-heading">
        <span className="news-tone-dot" aria-hidden="true" />
        {title}
      </div>
      <ul className="news-message-list">
        {messages.map((message) => <li key={message}>{message}</li>)}
      </ul>
    </div>
  );
}

function StockNewsCard({ stock }) {
  return (
    <article className="news-stock-card">
      <header className="news-stock-header">
        <div>
          <h4>{stock.name}</h4>
          <p>{stock.description}</p>
        </div>
        <span className="news-symbol">{stock.symbol}</span>
      </header>
      <div className="news-message-grid">
        <MessageColumn tone="positive" title="正面消息" messages={stock.positive} />
        <MessageColumn tone="negative" title="负面消息" messages={stock.negative} />
      </div>
    </article>
  );
}

export default function NewsPage() {
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState("");
  const [marketId, setMarketId] = useState("hk");
  const [sectorId, setSectorId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    apiGet("/api/news")
      .then((data) => {
        if (!cancelled) setPayload(data);
      })
      .catch((requestError) => {
        if (!cancelled) setError(requestError.message || "资讯加载失败");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <section className="news-state glass-card" role="alert">
        <strong>资讯暂时无法加载</strong>
        <span>{error}</span>
      </section>
    );
  }

  if (!payload) {
    return <section className="news-state glass-card">正在整理市场资讯...</section>;
  }

  const markets = payload.markets || [];
  const activeMarket = markets.find((market) => market.id === marketId) || markets[0];
  const activeSector = activeMarket?.sectors.find((sector) => sector.id === sectorId) || activeMarket?.sectors[0];

  return (
    <section className="news-page" aria-labelledby="news-page-title">
      <header className="news-hero">
        <div>
          <span className="news-kicker">MARKET INTELLIGENCE</span>
          <h3 id="news-page-title">资讯中心</h3>
        </div>
        <span className="news-disclaimer">{payload.meta?.disclaimer}</span>
      </header>

      <div className="news-market-tabs" role="tablist" aria-label="资讯市场">
        {markets.map((market) => (
          <button
            key={market.id}
            type="button"
            role="tab"
            aria-selected={activeMarket?.id === market.id}
            className={`news-market-tab ${activeMarket?.id === market.id ? "active" : ""}`}
            onClick={() => {
              setMarketId(market.id);
              setSectorId(null);
            }}
          >
            <strong>{market.name}</strong>
            <span>{market.sectors.length} 个栏目</span>
          </button>
        ))}
      </div>

      {activeMarket && activeSector ? (
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
              <div>
                <span>行业栏目</span>
                <h3>{activeSector.name}</h3>
              </div>
              <span>{activeSector.stocks.length} 家龙头公司</span>
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