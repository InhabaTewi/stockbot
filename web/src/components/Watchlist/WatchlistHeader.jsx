// src/components/Watchlist/WatchlistHeader.jsx
import React from "react";

export default function WatchlistHeader({ q, setQ, onAddTop }) {
  return (
    <div className="watch-header" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
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
