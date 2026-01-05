// src/charts/option.js

function safeNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

export function makeChartOption(title, bars, chartMode = "candle", previousClose = null) {
  const cat = [];
  const ohlc = [];
  const closeLine = [];
  const vol = [];

  for (const b of bars || []) {
    const [ts, open, close, low, high, volume] = b;
    const d = new Date(ts);
    const label =
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")} ` +
      `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;

    cat.push(label);
    ohlc.push([open, close, low, high]);
    closeLine.push(close);
    vol.push(volume ?? 0);
  }

  const pc = safeNum(previousClose);
  const markLine =
    pc === null
      ? undefined
      : {
          symbol: "none",
          lineStyle: { type: "dashed", width: 2 },
          label: { show: true, position: "end", formatter: `昨收 ${pc}` },
          data: [{ yAxis: pc }],
        };

  const isLine = chartMode === "line";

  return {
    title: { text: title, left: "center" },
    tooltip: { trigger: "axis", axisPointer: { type: "cross" } },
    grid: [
      { left: 60, right: 30, top: 60, height: "60%" },
      { left: 60, right: 30, top: "78%", height: "12%" },
    ],
    xAxis: [
      {
        type: "category",
        data: cat,
        boundaryGap: false,
        axisLine: { onZero: false },
        splitLine: { show: false },
        min: "dataMin",
        max: "dataMax",
      },
      {
        type: "category",
        gridIndex: 1,
        data: cat,
        boundaryGap: false,
        axisLine: { onZero: false },
        axisTick: { show: false },
        axisLabel: { show: false },
        splitLine: { show: false },
        min: "dataMin",
        max: "dataMax",
      },
    ],
    yAxis: [
      { scale: true, splitArea: { show: true } },
      { gridIndex: 1, splitNumber: 2, splitLine: { show: false } },
    ],
    dataZoom: [
      { type: "inside", xAxisIndex: [0, 1], start: 70, end: 100 },
      { type: "slider", xAxisIndex: [0, 1], top: "92%", start: 70, end: 100 },
    ],
    series: [
      isLine
        ? {
            name: "Close",
            type: "line",
            data: closeLine,
            smooth: true,
            showSymbol: false,
            markLine,
          }
        : {
            name: "K",
            type: "candlestick",
            data: ohlc,
            markLine,
            itemStyle: {
              color: "#00da3c", // 上涨颜色（绿色）
              color0: "#ec0000", // 下跌颜色（红色）
              borderColor: "#00da3c", // 上涨边框
              borderColor0: "#ec0000", // 下跌边框
            },
          },
      {
        name: "Volume",
        type: "bar",
        xAxisIndex: 1,
        yAxisIndex: 1,
        data: vol,
      },
    ],
  };
}
