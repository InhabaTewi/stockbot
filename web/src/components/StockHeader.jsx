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
    <div style={{ background: "white", border: "1px solid #e9e9ee", borderRadius: 12, padding: 14 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (onEnter?.(), onDirect?.())}
          placeholder="输入中文/英文/代码：如 腾讯 / 阿里 / 1810 / 9988.HK"
          style={styles.input}
        />

        <button style={styles.btn} onClick={onClear}>
          清空
        </button>

        <button style={styles.btnYellow} onClick={onRefresh} disabled={refreshDisabled}>
          刷新
        </button>
      </div>

      <div style={{ marginTop: 8, fontSize: 13, color: searchErr ? "#b42318" : "#666" }}>
        {loadingSearch ? "搜索中..." : searchErr ? `搜索失败：${searchErr}` : ""}
      </div>
    </div>
  );
}

const styles = {
  input: { flex: 1, minWidth: 320, padding: "10px 12px", borderRadius: 10, border: "1px solid #ddd" },
  btn: { padding: "10px 14px", borderRadius: 10, border: "1px solid #ddd", background: "white", cursor: "pointer", fontWeight: 800 },
  btnYellow: {
    padding: "10px 20px", // 加宽
    borderRadius: 10,
    border: "1px solid #ddd",
    background: "#ffd54a",
    cursor: "pointer",
    fontWeight: 900,
  },
};
