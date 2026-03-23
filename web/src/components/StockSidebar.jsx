// src/components/StockSidebar.jsx
import React from "react";
import { buildDisplay } from "../utils/format";

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
    <div className="sidebar-card" style={{ width: 360, minWidth: 320 }}>
      <div style={{ fontWeight: 900, fontSize: 16 }}>{buildDisplay(selected)}</div>

      <div className="kpi-grid">
        <div className="kpi-item">
          <div className="kpi-label">当前价</div>
          <div className="kpi-value">{fmtNum(price)}</div>
        </div>
        <div className="kpi-item">
          <div className="kpi-label">涨跌幅</div>
          <div className="kpi-value" style={{ color: pctColor(pct) }}>{fmtPct(pct)}</div>
        </div>
        <div className="kpi-item">
          <div className="kpi-label">昨收</div>
          <div className="kpi-value">{fmtNum(summary?.previousClose)}</div>
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

      <div style={{ marginTop: 14, borderTop: "1px solid rgba(32, 74, 130, 0.14)", paddingTop: 12 }}>
        <div style={{ fontWeight: 900, marginBottom: 8 }}>K线</div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="stock-button" style={{ padding: "8px 10px" }} onClick={() => setTf("1m")}>分K</button>
          <button className="stock-button" style={{ padding: "8px 10px" }} onClick={() => setTf("1d")}>日K</button>
          <button className="stock-button" style={{ padding: "8px 10px" }} onClick={() => setTf("1wk")}>周K</button>
          <button className="stock-button" style={{ padding: "8px 10px" }} onClick={() => setTf("1mo")}>月K</button>
        </div>

        <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
          <span className="muted" style={{ fontSize: 13 }}>范围:</span>
          <select value={range} onChange={(e) => setRange(e.target.value)} className="stock-select" style={{ padding: "8px 10px" }}>
            <option value="1d">1天</option>
            <option value="5d">5天</option>
            <option value="1mo">1月</option>
            <option value="3mo">3月</option>
            <option value="6mo">6月</option>
            <option value="1y">1年</option>
            <option value="2y">2年</option>
            <option value="5y">5年</option>
            <option value="10y">10年</option>
            <option value="max">最大</option>
          </select>
        </div>

        <div style={{ marginTop: 8 }}>
          <button className="stock-button stock-button-warn" style={{ padding: "8px 16px" }} onClick={onToggleMode} title="切换曲线/蜡烛">
            {chartMode === "line" ? "曲线" : "蜡烛"}
          </button>
        </div>

        <div style={{ marginTop: 8, color: kErr ? "#b42318" : "#5d6f8f", fontSize: 13 }}>
          {loadingSummary ? "加载行情..." : summaryErr ? `行情失败：${summaryErr}` : ""}
          {loadingK ? " · 加载K线..." : kErr ? ` · K线失败：${kErr}` : ""}
        </div>
      </div>
    </div>
  );
}

const styles = {
  row: { display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" },
  label: { color: "#5d6f8f", fontSize: 13 },
  value: { fontWeight: 900, fontSize: 14 },
  sub: { marginLeft: 6, color: "#5d6f8f", fontSize: 12, fontWeight: 700 },
};
