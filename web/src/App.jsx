import React, { useEffect, useMemo, useState } from "react";
import Tabs from "./components/Tabs";
import SearchPage from "./pages/SearchPage";
import WatchlistPage from "./pages/WatchlistPage";
import ComparePage from "./pages/ComparePage";
import AlertsPage from "./pages/AlertsPage";
import { getValue, setValue } from "./utils/storage";
import { buildDisplay } from "./utils/format";

const LS_APP = "stock_project_app_v1";
const LS_WATCH = "stock_project_watchlist_v1";
const WATCH_MODE = "caifutong";

function normalizeWatchItem(it) {
  if (!it) return it;
  return { ...it, mode: WATCH_MODE };
}

function watchItemKey(it) {
  const symbol = it?.symbol;
  return symbol ? String(symbol) : "";
}

function uniqueBySymbol(items) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const n = normalizeWatchItem(it);
    const k = watchItemKey(n);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(n);
  }
  return out;
}

export default function App() {
  const cachedApp = useMemo(() => getValue(LS_APP, null), []);
  const [tab, setTab] = useState(cachedApp?.tab ?? "search");

  const [watchItems, setWatchItems] = useState(() => uniqueBySymbol(getValue(LS_WATCH, []) || []));

  useEffect(() => setValue(LS_APP, { tab }), [tab]);
  useEffect(() => setValue(LS_WATCH, watchItems), [watchItems]);

  function addToWatch(it) {
    if (!it?.symbol) return;
    const item = normalizeWatchItem(it);
    setWatchItems((prev) => uniqueBySymbol([...(prev || []), item]));
    alert(`${buildDisplay(item)}（财付通模式）已添加至监控列表`);
    // 你也可以在加入后自动跳到监控页：setTab("watch")
  }

  return (
    <div className="app-shell">
      <div className="app-top">
        <div>
          <h2 className="app-title">Quant Vision HK</h2>
          <p className="app-subtitle">港股多维分析 · 实时看盘 · 监控与对比</p>
        </div>
        <Tabs active={tab} onChange={setTab} />
      </div>

      <div className="app-content">
        {tab === "search" ? <SearchPage onAddWatch={addToWatch} /> : null}
        {tab === "watch" ? <WatchlistPage watchItems={watchItems} setWatchItems={setWatchItems} /> : null}
        {tab === "compare" ? <ComparePage /> : null}
        {tab === "alerts" ? <AlertsPage /> : null}
      </div>
    </div>
  );
}
