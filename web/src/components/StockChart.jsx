import React from "react";
import ReactECharts from "echarts-for-react";

export default function StockChart({ selected, option }) {
  return (
    <div style={styles.card}>
      {!selected ? (
        <div style={styles.muted}>右侧将显示图表。</div>
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

const styles = {
  card: { padding: 14, border: "1px solid #e9e9ee", borderRadius: 12, background: "white", flex: "1 1 auto", minWidth: 0 },
  muted: { color: "#666", fontSize: 13 },
};
