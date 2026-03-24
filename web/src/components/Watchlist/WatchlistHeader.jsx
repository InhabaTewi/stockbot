// src/components/Watchlist/WatchlistHeader.jsx
import React from "react";

export default function WatchlistHeader({ q, setQ, onAddTop, source, onChangeSource }) {
  return (
    <div className="watch-header" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <div className="source-switch-wrap" style={{ marginBottom: 0 }}>
        <span className="source-switch-label">监控来源</span>
        <button
          className={`source-chip ${source === "normal" ? "active" : ""}`}
          onClick={() => onChangeSource?.("normal")}
          type="button"
        >
          普通模式
        </button>
        <button
          className={`source-chip ${source === "caifutong" ? "active" : ""}`}
          onClick={() => onChangeSource?.("caifutong")}
          type="button"
        >
          财付通模式
        </button>
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onAddTop()}
        placeholder="在监控页搜索添加：输入中文/英文名/代码"
        className="stock-input"
        style={{ flex: 1, minWidth: 320, padding: "10px 12px" }}
      />
      <button className="stock-button stock-button-warn" style={{ padding: "10px 20px" }} onClick={onAddTop}>
        添加到监控
      </button>
    </div>
  );
}
