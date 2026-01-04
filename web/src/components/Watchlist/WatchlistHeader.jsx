// src/components/Watchlist/WatchlistHeader.jsx
import React from "react";

export default function WatchlistHeader({ q, setQ, onAddTop }) {
  return (
    <div style={styles.row}>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onAddTop()}
        placeholder="在监控页搜索添加：输入中文/英文名/代码"
        style={styles.input}
      />
      <button onClick={onAddTop} style={styles.btnYellow}>
        添加到监控
      </button>
    </div>
  );
}

const styles = {
  row: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" },
  input: { flex: 1, minWidth: 320, padding: "10px 12px", borderRadius: 10, border: "1px solid #ddd" },
  btnYellow: {
    padding: "10px 20px",
    borderRadius: 10,
    border: "1px solid #ddd",
    background: "#ffd54a",
    cursor: "pointer",
    fontWeight: 900,
  },
};
