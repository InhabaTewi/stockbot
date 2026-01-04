import React from "react";

export default function Tabs({ active, onChange }) {
  const tabs = [
    { k: "search", label: "搜索" },
    { k: "watch", label: "监控" },
    { k: "compare", label: "比对" },
    { k: "alerts", label: "预警" },
  ];

  return (
    <div style={styles.wrap}>
      {tabs.map((t) => (
        <button
          key={t.k}
          onClick={() => onChange(t.k)}
          style={{
            ...styles.tab,
            background: active === t.k ? "white" : "transparent",
            borderColor: active === t.k ? "#ddd" : "transparent",
            fontWeight: active === t.k ? 800 : 600,
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

const styles = {
  wrap: {
    display: "flex",
    gap: 8,
    padding: 6,
    border: "1px solid #e9e9ee",
    borderRadius: 12,
    background: "#f1f2f7",
    width: "fit-content",
  },
  tab: {
    padding: "8px 12px",
    borderRadius: 10,
    border: "1px solid transparent",
    cursor: "pointer",
  },
};
