// src/components/Watchlist/WatchlistCard.jsx
import React, { useMemo } from "react";
import ReactECharts from "echarts-for-react";
import { makeChartOption } from "../../charts/option";
import { buildDisplay } from "../../utils/format";

function fmtNum(x) {
  if (x === null || x === undefined || Number.isNaN(Number(x))) return "--";
  return Number(x).toFixed(3).replace(/\.?0+$/, "");
}
function fmtPct(x) {
  if (x === null || x === undefined || Number.isNaN(Number(x))) return "--";
  const n = Number(x);
  const s = n >= 0 ? "+" : "";
  return `${s}${n.toFixed(2)}%`;
}
function pctColor(pct) {
  const n = Number(pct);
  if (pct === null || pct === undefined || Number.isNaN(n)) return "#111";
  if (n > 0) return "crimson";
  if (n < 0) return "seagreen";
  return "#111";
}

export default function WatchlistCard({
  item,
  summary,
  kBars,
  loading,
  expanded,
  tf,
  range,
  onToggle,
  onToggleTf,
  onRemove,
  onRefreshOne,
  dragProps,
}) {
  const option = useMemo(() => {
    const title = `${buildDisplay(item)} · ${tf} · ${range}`;
    // 监控页展开默认看分K曲线 + 昨收线
    return makeChartOption(title, kBars || [], "line", summary?.previousClose);
  }, [item, kBars, summary, tf, range]);

  return (
    <div className="watch-card" {...dragProps}>
      <div style={styles.head}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={styles.title}>{buildDisplay(item)}</div>
          <div className={`watch-mode-tag ${item?.mode === "caifutong" ? "is-caifutong" : "is-normal"}`}>
            {item?.mode === "caifutong" ? "财付通模式" : "普通模式"}
          </div>
        </div>

        <div className="kpi-grid" style={{ marginTop: 0 }}>
          <div className="kpi-item" style={{ minWidth: 110 }}>
            <div className="kpi-label">价格</div>
            <div className="kpi-value" style={{ fontSize: 16 }}>{fmtNum(summary?.price)}</div>
          </div>
          <div className="kpi-item" style={{ minWidth: 110 }}>
            <div className="kpi-label">涨跌幅</div>
            <div className="kpi-value" style={{ fontSize: 16, color: pctColor(summary?.pctChange) }}>{fmtPct(summary?.pctChange)}</div>
          </div>
        </div>

        <div style={styles.actions}>
          <button className="stock-button stock-button-primary" style={{ padding: "8px 16px" }} onClick={onRefreshOne} title="刷新该股票">
            刷新
          </button>
          <button className="stock-button" style={{ padding: "8px 10px" }} onClick={onToggle}>
            {expanded ? "收起" : "展开K线"}
          </button>
          {expanded && (
            <button className="stock-button" style={{ padding: "8px 10px" }} onClick={onToggleTf} title="切换分K/日K">
              {tf === "1m" ? "日K" : "分K"}
            </button>
          )}
          <button className="stock-button stock-button-danger" style={{ padding: "8px 16px" }} onClick={onRemove}>
            删除
          </button>
        </div>
      </div>

      {loading ? <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>加载中...</div> : null}

      {expanded && (
        <div style={{ marginTop: 12 }}>
          <ReactECharts option={option} style={{ height: 420, width: "100%" }} notMerge={true} lazyUpdate={true} />
        </div>
      )}
    </div>
  );
}

const styles = {
  head: { display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" },
  title: { fontWeight: 900, fontSize: 16, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  actions: { display: "flex", gap: 8, alignItems: "center", marginLeft: "auto" },
};
