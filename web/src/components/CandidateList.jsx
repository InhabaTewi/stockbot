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
    <div className="glass-card search-candidates">
      {sorted.map((it, idx) => (
        <div
          key={`${it.symbol}-${idx}`}
          className="search-candidate-row"
          style={{ borderTop: idx === 0 ? "none" : "1px solid rgba(32, 74, 130, 0.1)" }}
        >
          <div style={{ cursor: "pointer" }} onClick={() => onPick(it)}>
            <div style={{ fontWeight: 800 }}>{buildDisplay(it)}</div>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button className="stock-button" style={{ padding: "8px 12px" }} onClick={() => onAddWatch(it)} title="添加监控">
              添加监控
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
