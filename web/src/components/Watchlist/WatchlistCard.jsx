// src/components/Watchlist/WatchlistCard.jsx
import React, { useMemo } from "react";
import ReactECharts from "echarts-for-react";
import { makeChartOption } from "../../charts/option";

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
  onToggle,
  onRemove,
  onRefreshOne,
  dragProps,
}) {
  const option = useMemo(() => {
    const title = `${item?.cn_name || item?.symbol} · 1m · 1d`;
    // 监控页展开默认看分K曲线 + 昨收线
    return makeChartOption(title, kBars || [], "line", summary?.previousClose);
  }, [item, kBars, summary]);

  return (
    <div style={styles.card} {...dragProps}>
      <div style={styles.head}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={styles.title}>{item?.cn_name || item?.symbol}</div>
          <div style={styles.sub}>{item.symbol}</div>
        </div>

        <div style={styles.kpis}>
          <div style={styles.kpi}>
            <div style={styles.k}>价格</div>
            <div style={styles.v}>{fmtNum(summary?.price)}</div>
          </div>
          <div style={styles.kpi}>
            <div style={styles.k}>涨跌幅</div>
            <div style={{ ...styles.v, color: pctColor(summary?.pctChange) }}>{fmtPct(summary?.pctChange)}</div>
          </div>
        </div>

        <div style={styles.actions}>
          <button style={styles.btnYellow} onClick={onRefreshOne} title="刷新该股票">
            刷新
          </button>
          <button style={styles.btn} onClick={onToggle}>
            {expanded ? "收起" : "展开K线"}
          </button>
          <button style={styles.btnDanger} onClick={onRemove}>
            删除
          </button>
        </div>
      </div>

      {loading ? <div style={styles.muted}>加载中...</div> : null}

      {expanded && (
        <div style={{ marginTop: 12 }}>
          <ReactECharts option={option} style={{ height: 420, width: "100%" }} notMerge={true} lazyUpdate={true} />
        </div>
      )}
    </div>
  );
}

const styles = {
  card: { padding: 14, border: "1px solid #e9e9ee", borderRadius: 12, background: "white" },
  head: { display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" },
  title: { fontWeight: 900, fontSize: 16, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  sub: { color: "#666", fontSize: 12, marginTop: 2 },
  kpis: { display: "flex", gap: 10, alignItems: "center" },
  kpi: { padding: "8px 10px", border: "1px solid #f0f0f0", borderRadius: 10, background: "#fafafa", minWidth: 110 },
  k: { color: "#666", fontSize: 12 },
  v: { fontWeight: 900, fontSize: 16, marginTop: 2 },
  actions: { display: "flex", gap: 8, alignItems: "center", marginLeft: "auto" },
  btn: { padding: "8px 10px", borderRadius: 10, border: "1px solid #ddd", background: "white", cursor: "pointer", fontWeight: 800 },
  btnYellow: { padding: "8px 16px", borderRadius: 10, border: "1px solid #ddd", background: "#ffd54a", cursor: "pointer", fontWeight: 900 },
  btnDanger: { padding: "8px 16px", borderRadius: 10, border: "1px solid #ddd", background: "#ffeded", cursor: "pointer", fontWeight: 900, color: "#b42318" },
  muted: { color: "#666", fontSize: 13, marginTop: 8 },
};
