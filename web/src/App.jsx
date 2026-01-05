import React, { useEffect, useMemo, useState } from "react";
import Tabs from "./components/Tabs";
import SearchPage from "./pages/SearchPage";
import WatchlistPage from "./pages/WatchlistPage";
import ComparePage from "./pages/ComparePage";
import AlertsPage from "./pages/AlertsPage";
import { getValue, setValue } from "./utils/storage";

const LS_APP = "stock_project_app_v1";
const LS_WATCH = "stock_project_watchlist_v1";

function uniqueBySymbol(items) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const k = it?.symbol;
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}

export default function App() {
  const cachedApp = useMemo(() => getValue(LS_APP, null), []);
  const [tab, setTab] = useState(cachedApp?.tab ?? "search");

  const [watchItems, setWatchItems] = useState(() => getValue(LS_WATCH, []) || []);

  useEffect(() => setValue(LS_APP, { tab }), [tab]);
  useEffect(() => setValue(LS_WATCH, watchItems), [watchItems]);

  function addToWatch(it) {
    if (!it?.symbol) return;
    setWatchItems((prev) => uniqueBySymbol([...(prev || []), it]));
    alert(`${it.symbol} 已添加至监控列表`);
    // 你也可以在加入后自动跳到监控页：setTab("watch")
  }

  return (
    <div style={styles.page}>
      <div style={styles.top}>
        <h2 style={{ margin: 0 }}>股票查询系统</h2>
        <Tabs active={tab} onChange={setTab} />
      </div>

      <div style={styles.content}>
        {tab === "search" ? <SearchPage onAddWatch={addToWatch} /> : null}
        {tab === "watch" ? <WatchlistPage watchItems={watchItems} setWatchItems={setWatchItems} /> : null}
        {tab === "compare" ? <ComparePage /> : null}
        {tab === "alerts" ? <AlertsPage /> : null}
      </div>
    </div>
  );
}

const styles = {
  page: {
    maxWidth: 1400,
    margin: "0 auto",
    padding: 16,
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto",
    background: "#f6f7fb",
    minHeight: "100vh",
  },
  top: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" },
  content: { marginTop: 14 },
};
