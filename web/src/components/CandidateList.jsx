import React from "react";
import { buildDisplay } from "../utils/format";
import { rankHKItem } from "../utils/search";

export default function CandidateList({ items, onPick, onAddWatch }) {
  if (!items || items.length === 0) return null;

  const sorted = items
    .slice()
    .sort((a, b) => rankHKItem(a) - rankHKItem(b))
    .slice(0, 12);

  return (
    <div style={styles.box}>
      {sorted.map((it, idx) => (
        <div
          key={`${it.symbol}-${idx}`}
          style={{ ...styles.row, borderTop: idx === 0 ? "none" : "1px solid #f2f2f2" }}
        >
          <div style={{ cursor: "pointer" }} onClick={() => onPick(it)}>
            <div style={{ fontWeight: 800 }}>{buildDisplay(it)}</div>
            <div style={styles.muted}>{it.symbol}</div>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button style={styles.btn} onClick={() => onAddWatch(it)} title="加入监控">
              监控
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

const styles = {
  box: { marginTop: 10, border: "1px solid #eee", borderRadius: 12, overflow: "hidden", background: "white" },
  row: {
    padding: "10px 12px",
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
  },
  muted: { color: "#666", fontSize: 13, marginTop: 2 },
  btn: {
    padding: "8px 12px",
    borderRadius: 10,
    border: "1px solid #ddd",
    background: "white",
    cursor: "pointer",
    fontWeight: 700,
  },
};
