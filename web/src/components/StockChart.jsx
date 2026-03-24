import React from "react";
import ReactECharts from "echarts-for-react";

export default function StockChart({ selected, option }) {
  return (
    <div className="chart-card stock-chart-main">
      {!selected ? (
        <div className="muted" style={{ fontSize: 13 }}>右侧将显示图表。</div>
      ) : (
        <ReactECharts
          option={option}
          style={{ height: "min(78vh, 860px)", minHeight: 460, width: "100%" }}
          notMerge={true}
          lazyUpdate={true}
          onChartReady={(chart) => setTimeout(() => chart.resize(), 50)}
        />
      )}
    </div>
  );
}
