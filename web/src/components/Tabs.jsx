import React from "react";

export default function Tabs({ active, onChange }) {
  const tabs = [
    { k: "search", label: "搜索" },
    { k: "watch", label: "监控" },
    { k: "compare", label: "比对" },
    { k: "alerts", label: "预警" },
    { k: "news", label: "资讯" },
  ];

  return (
    <div className="tabs-wrap">
      {tabs.map((t) => (
        <button
          key={t.k}
          onClick={() => onChange(t.k)}
          className={`tab-item ${active === t.k ? "active" : ""}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
