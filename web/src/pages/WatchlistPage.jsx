import React, { useEffect, useMemo, useRef, useState } from "react";
import WatchlistHeader from "../components/Watchlist/WatchlistHeader";
import WatchlistCard from "../components/Watchlist/WatchlistCard";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { apiGet } from "../services/api";
import { getValue, setValue } from "../utils/storage";
import { normalizeQuery, rankHKItem } from "../utils/search";

const LS_WATCH = "stock_project_watchlist_v1";

function normalizeWatchItem(it) {
  if (!it) return it;
  const mode = it.mode || (it.source === "wencai" ? "caifutong" : "normal");
  return { ...it, mode };
}

function watchItemKey(it) {
  const symbol = it?.symbol;
  const mode = it?.mode || "normal";
  return symbol ? `${symbol}::${mode}` : "";
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

export default function WatchlistPage({ watchItems, setWatchItems }) {
  // 展开状态：symbol -> bool（也持久化）
  const [expandedMap, setExpandedMap] = useState(() => getValue(`${LS_WATCH}:expanded`, {}));
  const expandedMapRef = useRef(expandedMap);
  useEffect(() => {
    expandedMapRef.current = expandedMap;
    setValue(`${LS_WATCH}:expanded`, expandedMap);
  }, [expandedMap]);

  // k线类型：symbol -> "1m" | "1d"（默认分k线）
  const [tfMap, setTfMap] = useState(() => getValue(`${LS_WATCH}:tf`, {}));
  const tfMapRef = useRef(tfMap);
  useEffect(() => {
    tfMapRef.current = tfMap;
    setValue(`${LS_WATCH}:tf`, tfMap);
  }, [tfMap]);

  // k线范围：symbol -> range（默认分k线1d，日k线4mo）
  const [rangeMap, setRangeMap] = useState(() => getValue(`${LS_WATCH}:range`, {}));
  const rangeMapRef = useRef(rangeMap);
  useEffect(() => {
    rangeMapRef.current = rangeMap;
    setValue(`${LS_WATCH}:range`, rangeMap);
  }, [rangeMap]);

  // 数据缓存：summary/kline（简单内存缓存，页面刷新后会重新拉；如果你要持久化也可以）
  const [summaryMap, setSummaryMap] = useState({});
  const [klineMap, setKlineMap] = useState({});
  const [loadingMap, setLoadingMap] = useState({});

  // 顶部添加搜索
  const [q, setQ] = useState("");
  const [watchSource, setWatchSource] = useState(() => getValue(`${LS_WATCH}:source`, "normal"));
  const dq = useDebouncedValue(q, 250);
  const [searchErr, setSearchErr] = useState("");

  useEffect(() => setValue(`${LS_WATCH}:source`, watchSource), [watchSource]);

  // 自动：监控列表里股票定时刷新 summary（20s）
  useEffect(() => {
    if (!watchItems || watchItems.length === 0) return;
    const t = setInterval(() => {
      watchItems.forEach((it) => {
        if (!it?.symbol) return;
        refreshOne(it, { summaryOnly: true }).catch(() => {});
      });
    }, 20000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchItems]);

  // 初始：加载 watchItems 的 summary
  useEffect(() => {
    if (!watchItems || watchItems.length === 0) return;
    watchItems.forEach((it) => it?.symbol && refreshOne(it, { summaryOnly: true }).catch(() => {}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchItems?.length]);

  async function refreshOne(item, { summaryOnly = false } = {}) {
    const symbol = item.symbol;
    const mode = item.mode || "normal";
    const key = watchItemKey(item);
    setLoadingMap((m) => ({ ...m, [key]: true }));
    try {
      const s = await apiGet("/api/summary", { symbol, source: mode });
      setSummaryMap((m) => ({ ...m, [key]: s }));
      if (!summaryOnly && expandedMapRef.current?.[key]) {
        const tf = tfMapRef.current[key] || "1m";
        const range = rangeMapRef.current[key] || (tf === "1d" ? "4mo" : "1d");
        const k = await apiGet("/api/kline", { symbol, tf, range, source: mode });
        setKlineMap((m) => ({ ...m, [key]: k.bars || [] }));
      }
    } finally {
      setLoadingMap((m) => ({ ...m, [key]: false }));
    }
  }

  async function toggleExpand(it) {
    const key = watchItemKey(it);
    const next = !expandedMapRef.current?.[key];
    setExpandedMap((m) => ({ ...m, [key]: next }));

    // 展开时立即拉一次 kline
    if (next) {
      setLoadingMap((m) => ({ ...m, [key]: true }));
      try {
        const tf = tfMapRef.current[key] || "1m";
        const range = rangeMapRef.current[key] || (tf === "1d" ? "4mo" : "1d");
        const k = await apiGet("/api/kline", { symbol: it.symbol, tf, range, source: it.mode || "normal" });
        setKlineMap((m) => ({ ...m, [key]: k.bars || [] }));
      } catch {
        // ignore
      } finally {
        setLoadingMap((m) => ({ ...m, [key]: false }));
      }
    }
  }

  function removeOne(item) {
    const key = watchItemKey(item);
    const next = (watchItems || []).filter((x) => watchItemKey(x) !== key);
    setWatchItems(next);
    setExpandedMap((m) => {
      const mm = { ...m };
      delete mm[key];
      return mm;
    });
  }

  async function toggleTf(item) {
    const key = watchItemKey(item);
    const current = tfMapRef.current[key] || "1m";
    const next = current === "1m" ? "1d" : "1m";
    setTfMap((m) => ({ ...m, [key]: next }));

    // 设置对应的range
    const nextRange = next === "1d" ? "4mo" : "1d";
    setRangeMap((m) => ({ ...m, [key]: nextRange }));

    // 如果展开了，重新加载k线
    if (expandedMapRef.current?.[key]) {
      setLoadingMap((m) => ({ ...m, [key]: true }));
      try {
        const k = await apiGet("/api/kline", { symbol: item.symbol, tf: next, range: nextRange, source: item.mode || "normal" });
        setKlineMap((m) => ({ ...m, [key]: k.bars || [] }));
      } catch {
        // ignore
      } finally {
        setLoadingMap((m) => ({ ...m, [key]: false }));
      }
    }
  }

  // 顶部“添加到监控”：用 /api/search 找 best match
  async function addTop() {
    setSearchErr("");
    const query = normalizeQuery(q);
    if (!query) return;

    try {
      const data = await apiGet("/api/search", { q: query, source: watchSource });
      const items = (data.items || []).slice().sort((a, b) => rankHKItem(a) - rankHKItem(b));
      if (items.length === 0) {
        setSearchErr("未找到匹配股票");
        return;
      }
      const pick = normalizeWatchItem({ ...items[0], mode: watchSource });
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
      <WatchlistHeader q={q} setQ={setQ} onAddTop={addTop} source={watchSource} onChangeSource={setWatchSource} />
      {searchErr ? <div style={{ color: "#b42318", fontSize: 13 }}>{searchErr}</div> : null}

      {list.length === 0 ? (
        <div className="alerts-card muted" style={{ fontSize: 14 }}>
          监控列表为空：你可以在这里搜索添加，或在“搜索页”点击“监控”按钮加入。
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {list.map((it, idx) => {
            const key = watchItemKey(it);
            const expanded = !!expandedMap[key];
            return (
              <div
                key={key}
                draggable
                onDragStart={() => onDragStart(idx)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(idx)}
              >
                <WatchlistCard
                  item={it}
                  summary={summaryMap[key]}
                  kBars={klineMap[key]}
                  loading={!!loadingMap[key]}
                  expanded={expanded}
                  tf={tfMap[key] || "1m"}
                  range={rangeMap[key] || ((tfMap[key] || "1m") === "1d" ? "4mo" : "1d")}
                  onToggle={() => toggleExpand(it)}
                  onToggleTf={() => toggleTf(it)}
                  onRemove={() => removeOne(it)}
                  onRefreshOne={() => refreshOne(it, { summaryOnly: false })}
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
