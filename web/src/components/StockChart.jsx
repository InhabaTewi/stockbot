import React from "react";
import ReactECharts from "echarts-for-react";

export default function StockChart({ selected, option }) {
  return (
    <div className="chart-card">
      {!selected ? (
        <div className="muted" style={{ fontSize: 13 }}>右侧将显示图表。</div>
      ) : (
        <ReactECharts
          option={option}
          style={{ height: 720, width: "100%" }}
          notMerge={true}
          lazyUpdate={true}
          onChartReady={(chart) => setTimeout(() => chart.resize(), 50)}
        />
      )}
    </div>
  );
}
