import React, { useEffect, useMemo, useRef, useState } from "react";
import WatchlistHeader from "../components/Watchlist/WatchlistHeader";
import WatchlistCard from "../components/Watchlist/WatchlistCard";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { apiGet } from "../services/api";
import { getValue, setValue } from "../utils/storage";
import { normalizeQuery, rankHKItem } from "../utils/search";

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

export default function WatchlistPage({ watchItems, setWatchItems }) {
  // 展开状态：symbol -> bool（也持久化）
  const [expandedMap, setExpandedMap] = useState(() => getValue(`${LS_WATCH}:expanded`, {}));
  const expandedMapRef = useRef(expandedMap);
  useEffect(() => {
    expandedMapRef.current = expandedMap;
    setValue(`${LS_WATCH}:expanded`, expandedMap);
  }, [expandedMap]);

  // 数据缓存：summary/kline（简单内存缓存，页面刷新后会重新拉；如果你要持久化也可以）
  const [summaryMap, setSummaryMap] = useState({});
  const [klineMap, setKlineMap] = useState({});
  const [loadingMap, setLoadingMap] = useState({});

  // 顶部添加搜索
  const [q, setQ] = useState("");
  const dq = useDebouncedValue(q, 250);
  const [searchErr, setSearchErr] = useState("");

  // 自动：监控列表里股票定时刷新 summary（20s）
  useEffect(() => {
    if (!watchItems || watchItems.length === 0) return;
    const t = setInterval(() => {
      watchItems.forEach((it) => {
        if (!it?.symbol) return;
        refreshOne(it.symbol, { summaryOnly: true }).catch(() => {});
      });
    }, 20000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchItems]);

  // 初始：加载 watchItems 的 summary
  useEffect(() => {
    if (!watchItems || watchItems.length === 0) return;
    watchItems.forEach((it) => it?.symbol && refreshOne(it.symbol, { summaryOnly: true }).catch(() => {}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchItems?.length]);

  async function refreshOne(symbol, { summaryOnly = false } = {}) {
    setLoadingMap((m) => ({ ...m, [symbol]: true }));
    try {
      const s = await apiGet("/api/summary", { symbol });
      setSummaryMap((m) => ({ ...m, [symbol]: s }));
      if (!summaryOnly && expandedMapRef.current?.[symbol]) {
        const k = await apiGet("/api/kline", { symbol, tf: "1m", range: "1d" });
        setKlineMap((m) => ({ ...m, [symbol]: k.bars || [] }));
      }
    } finally {
      setLoadingMap((m) => ({ ...m, [symbol]: false }));
    }
  }

  async function toggleExpand(it) {
    const symbol = it.symbol;
    const next = !expandedMapRef.current?.[symbol];
    setExpandedMap((m) => ({ ...m, [symbol]: next }));

    // 展开时立即拉一次 kline
    if (next) {
      setLoadingMap((m) => ({ ...m, [symbol]: true }));
      try {
        const k = await apiGet("/api/kline", { symbol, tf: "1m", range: "1d" });
        setKlineMap((m) => ({ ...m, [symbol]: k.bars || [] }));
      } catch {
        // ignore
      } finally {
        setLoadingMap((m) => ({ ...m, [symbol]: false }));
      }
    }
  }

  function removeOne(symbol) {
    const next = (watchItems || []).filter((x) => x.symbol !== symbol);
    setWatchItems(next);
    setExpandedMap((m) => {
      const mm = { ...m };
      delete mm[symbol];
      return mm;
    });
  }

  // 顶部“添加到监控”：用 /api/search 找 best match
  async function addTop() {
    setSearchErr("");
    const query = normalizeQuery(q);
    if (!query) return;

    try {
      const data = await apiGet("/api/search", { q: query });
      const items = (data.items || []).slice().sort((a, b) => rankHKItem(a) - rankHKItem(b));
      if (items.length === 0) {
        setSearchErr("未找到匹配股票");
        return;
      }
      const pick = items[0];
      const next = uniqueBySymbol([...(watchItems || []), pick]);
      setWatchItems(next);
      setQ("");
    } catch (e) {
      setSearchErr(String(e.message || e));
    }
  }

  // 拖拽排序：保存 dragging index
  const dragIndexRef = useRef(-1);

  function onDragStart(i) {
    dragIndexRef.current = i;
  }

  function onDrop(i) {
    const from = dragIndexRef.current;
    if (from < 0 || from === i) return;
    const arr = (watchItems || []).slice();
    const [moved] = arr.splice(from, 1);
    arr.splice(i, 0, moved);
    dragIndexRef.current = -1;
    setWatchItems(arr);
  }

  const list = useMemo(() => watchItems || [], [watchItems]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <WatchlistHeader q={q} setQ={setQ} onAddTop={addTop} />
      {searchErr ? <div style={{ color: "#b42318", fontSize: 13 }}>{searchErr}</div> : null}

      {list.length === 0 ? (
        <div style={styles.muted}>监控列表为空：你可以在这里搜索添加，或在“搜索页”点击“监控”按钮加入。</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {list.map((it, idx) => {
            const sym = it.symbol;
            const expanded = !!expandedMap[sym];
            return (
              <div
                key={sym}
                draggable
                onDragStart={() => onDragStart(idx)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(idx)}
              >
                <WatchlistCard
                  item={it}
                  summary={summaryMap[sym]}
                  kBars={klineMap[sym]}
                  loading={!!loadingMap[sym]}
                  expanded={expanded}
                  onToggle={() => toggleExpand(it)}
                  onRemove={() => removeOne(sym)}
                  onRefreshOne={() => refreshOne(sym, { summaryOnly: false })}
                  dragProps={{ title: "拖拽排序：按住卡片拖动" }}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const styles = {
  muted: { color: "#666", fontSize: 13, marginTop: 8 },
};
