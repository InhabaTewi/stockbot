// src/components/StockHeader.jsx
import React from "react";

export default function StockHeader({
  q,
  setQ,
  onEnter,
  onDirect,
  onRefresh,
  refreshDisabled,
  onClear,
  loadingSearch,
  searchErr,
}) {
  return (
    <div className="glass-card search-header">
      <div className="search-header-row">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (onEnter?.(), onDirect?.())}
          placeholder="输入中文/英文/代码：如 腾讯 / 阿里 / 1810 / 9988.HK"
          className="stock-input"
          style={{ flex: 1, minWidth: 320, padding: "10px 12px" }}
        />

        <button className="stock-button" style={{ padding: "10px 14px" }} onClick={onClear}>
          清空
        </button>

        <button className="stock-button stock-button-warn" style={{ padding: "10px 20px" }} onClick={onRefresh} disabled={refreshDisabled}>
          刷新
        </button>
      </div>

      <div style={{ marginTop: 8, fontSize: 13, color: searchErr ? "#b42318" : "#5d6f8f" }}>
        {loadingSearch ? "搜索中..." : searchErr ? `搜索失败：${searchErr}` : ""}
      </div>
    </div>
  );
}
