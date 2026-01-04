// src/components/StockSidebar.jsx
import React from "react";

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
function ratioPct(price, high) {
  const p = Number(price);
  const h = Number(high);
  if (!Number.isFinite(p) || !Number.isFinite(h) || h === 0) return null;
  return (p / h) * 100;
}

export default function StockSidebar({
  selected,
  summary,
  loadingSummary,
  summaryErr,

  tf,
  setTf,
  range,
  setRange,

  chartMode,
  onToggleMode,

  loadingK,
  kErr,
}) {
  if (!selected) return null;

  const price = summary?.price;
  const pct = summary?.pctChange;

  const pct6 = summary?.pctOfHigh6m ?? ratioPct(price, summary?.high6m);
  const pct1y = summary?.pctOfHigh1y ?? ratioPct(price, summary?.high1y);

  return (
    <div style={styles.side}>
      <div style={{ fontWeight: 900, fontSize: 16 }}>{selected.cn_name}</div>
      <div style={{ color: "#666", fontSize: 12, marginTop: 2 }}>{selected.symbol}</div>

      <div style={{ marginTop: 12, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div style={styles.kpi}>
          <div style={styles.k}>当前价</div>
          <div style={styles.v}>{fmtNum(price)}</div>
        </div>
        <div style={styles.kpi}>
          <div style={styles.k}>涨跌幅</div>
          <div style={{ ...styles.v, color: pctColor(pct) }}>{fmtPct(pct)}</div>
        </div>
        <div style={styles.kpi}>
          <div style={styles.k}>昨收</div>
          <div style={styles.v}>{fmtNum(summary?.previousClose)}</div>
        </div>
      </div>

      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={styles.row}>
          <span style={styles.label}>半年最高</span>
          <span style={styles.value}>
            {fmtNum(summary?.high6m)}
            <span style={styles.sub}>
              （现价占比 {pct6 == null ? "--" : `${Number(pct6).toFixed(2)}%`}）
            </span>
          </span>
        </div>

        <div style={styles.row}>
          <span style={styles.label}>一年最高</span>
          <span style={styles.value}>
            {fmtNum(summary?.high1y)}
            <span style={styles.sub}>
              （现价占比 {pct1y == null ? "--" : `${Number(pct1y).toFixed(2)}%`}）
            </span>
          </span>
        </div>

        <div style={styles.row}>
          <span style={styles.label}>分K涨跌速度</span>
          <span style={styles.value}>
            {summary?.intradaySpeed == null ? "--" : Number(summary.intradaySpeed).toFixed(2)}
          </span>
        </div>
      </div>

      <div style={{ marginTop: 14, borderTop: "1px solid #f0f0f0", paddingTop: 12 }}>
        <div style={{ fontWeight: 900, marginBottom: 8 }}>K线</div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={styles.btn} onClick={() => setTf("1m")}>分K</button>
          <button style={styles.btn} onClick={() => setTf("1d")}>日K</button>
          <button style={styles.btn} onClick={() => setTf("1wk")}>周K</button>
          <button style={styles.btn} onClick={() => setTf("1mo")}>月K</button>

          <button style={styles.btnYellow} onClick={onToggleMode} title="切换曲线/蜡烛">
            {chartMode === "line" ? "曲线" : "蜡烛"}
          </button>
        </div>

        <div style={{ marginTop: 8, color: kErr ? "#b42318" : "#666", fontSize: 13 }}>
          {loadingSummary ? "加载行情..." : summaryErr ? `行情失败：${summaryErr}` : ""}
          {loadingK ? " · 加载K线..." : kErr ? ` · K线失败：${kErr}` : ""}
        </div>
      </div>
    </div>
  );
}

const styles = {
  side: { width: 360, minWidth: 320, background: "white", border: "1px solid #e9e9ee", borderRadius: 12, padding: 14 },
  kpi: { padding: "8px 10px", border: "1px solid #f0f0f0", borderRadius: 10, background: "#fafafa", minWidth: 110 },
  k: { color: "#666", fontSize: 12 },
  v: { fontWeight: 900, fontSize: 18, marginTop: 2 },
  row: { display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" },
  label: { color: "#666", fontSize: 13 },
  value: { fontWeight: 900, fontSize: 14 },
  sub: { marginLeft: 6, color: "#666", fontSize: 12, fontWeight: 700 },
  btn: { padding: "8px 10px", borderRadius: 10, border: "1px solid #ddd", background: "white", cursor: "pointer", fontWeight: 800 },
  btnYellow: { padding: "8px 16px", borderRadius: 10, border: "1px solid #ddd", background: "#ffd54a", cursor: "pointer", fontWeight: 900 },
};
