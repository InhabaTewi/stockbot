import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactECharts from "echarts-for-react";

const LS_KEY = "stock_project_state_v1";

function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || typeof s !== "object") return null;
    return s;
  } catch {
    return null;
  }
}

function saveState(partial) {
  try {
    const prev = loadState() || {};
    const next = { ...prev, ...partial, _ts: Date.now() };
    localStorage.setItem(LS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

function useDebouncedValue(value, delayMs) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return v;
}

function fmtPct(x) {
  if (x === null || x === undefined || Number.isNaN(x)) return "--";
  const n = Number(x);
  const s = n >= 0 ? "+" : "";
  return `${s}${n.toFixed(2)}%`;
}

function fmtNum(x) {
  if (x === null || x === undefined || Number.isNaN(x)) return "--";
  return Number(x).toFixed(3).replace(/\.?0+$/, "");
}

function normalizeQuery(q) {
  const s = (q || "").trim();
  if (!s) return "";
  return s.toUpperCase();
}

// 主标的排序：优先普通股（不含 -R / -WR），其次 -SW，再其次 -R/-WR；港股 0xxxx 优于 8xxxx
function rankHKItem(it) {
  const code = (it.stock_code || "").trim();
  const name = (it.cn_name || it.name || "").toUpperCase();
  const symbol = (it.symbol || "").toUpperCase();
  const isHK = (it.market || "").toUpperCase() === "HK" || symbol.endsWith(".HK");
  if (!isHK) return 1000;

  const isWR = name.includes("-WR");
  const isR = name.includes("-R");
  const isSW = name.includes("-SW");

  let score = 0;
  if (!isWR && !isR) score -= 50;
  if (isSW) score += 5;
  if (isR) score += 20;
  if (isWR) score += 30;

  if (code.startsWith("0")) score -= 10;
  if (code.startsWith("8")) score += 10;

  const n = parseInt(code, 10);
  if (!Number.isNaN(n)) score += n / 100000;

  return score;
}

function buildDisplay(it) {
  const sym = it.symbol || "";
  const cn = it.cn_name || it.name || sym;

  let shown = sym;
  if (it.stock_code) {
    const isHK = (it.market || "").toUpperCase() === "HK" || sym.toUpperCase().endsWith(".HK");
    if (isHK) shown = `${it.stock_code}.HK`;
  }
  return `${cn}（${shown}）`;
}

async function apiGet(path, params) {
  const u = new URL(path, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && `${v}`.length > 0) u.searchParams.set(k, String(v));
    });
  }
  const r = await fetch(u.toString(), { credentials: "omit" });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`HTTP ${r.status}: ${text}`);
  }
  return r.json();
}

// bars: [ [ts_ms, open, close, low, high, volume], ... ]
function makeChartOption(title, bars, mode /* "candle" | "line" */) {
  const categoryData = [];
  const ohlc = [];
  const closeLine = [];
  const volumes = [];

  for (let i = 0; i < bars.length; i++) {
    const [ts, open, close, low, high, vol] = bars[i];
    const d = new Date(ts);

    const label =
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")} ` +
      `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;

    categoryData.push(label);
    ohlc.push([open, close, low, high]);
    closeLine.push(close);
    volumes.push(vol ?? 0);
  }

  const mainSeries =
    mode === "line"
      ? {
          name: "Close",
          type: "line",
          data: closeLine,
          showSymbol: false,
          smooth: true,
          lineStyle: { width: 2 },
        }
      : {
          name: "K",
          type: "candlestick",
          data: ohlc,
        };

  return {
    title: { text: title, left: 16, top: 10 },
    tooltip: { trigger: "axis", axisPointer: { type: "cross" } },
    grid: [
      { left: 70, right: 18, top: 60, height: "64%" },
      { left: 70, right: 18, top: "82%", height: "12%" },
    ],
    xAxis: [
      {
        type: "category",
        data: categoryData,
        boundaryGap: mode === "candle",
        axisLine: { onZero: false },
        splitLine: { show: false },
        min: "dataMin",
        max: "dataMax",
      },
      {
        type: "category",
        gridIndex: 1,
        data: categoryData,
        boundaryGap: true,
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
      { type: "slider", xAxisIndex: [0, 1], top: "94%", start: 70, end: 100 },
    ],
    series: [
      mainSeries,
      {
        name: "Volume",
        type: "bar",
        xAxisIndex: 1,
        yAxisIndex: 1,
        data: volumes,
      },
    ],
  };
}

export default function App() {
  // ====== 读取缓存作为初始值 ======
  const cached = useMemo(() => loadState(), []);
  const initQ = cached?.q ?? "";
  const initSelected = cached?.selected ?? null;
  const initTf = cached?.tf ?? "1m";
  const initRange = cached?.range ?? "1d";
  const initChartMode = cached?.chartMode ?? (initTf === "1m" && initRange === "1d" ? "line" : "candle");
  const initModeLock = cached?.modeLock ?? false;

  // 搜索
  const [q, setQ] = useState(initQ);
  const dq = useDebouncedValue(q, 250);
  const [candidates, setCandidates] = useState([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [searchErr, setSearchErr] = useState("");

  // 选中标的
  const [selected, setSelected] = useState(initSelected);

  // summary
  const [summary, setSummary] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [summaryErr, setSummaryErr] = useState("");

  // K线
  const [tf, setTf] = useState(initTf);
  const [range, setRange] = useState(initRange);
  const [kBars, setKBars] = useState([]);
  const [loadingK, setLoadingK] = useState(false);
  const [kErr, setKErr] = useState("");

  // 图表模式：candle / line
  const [chartMode, setChartMode] = useState(initChartMode);
  const modeAutoGuard = useRef(initModeLock); // true=用户手动锁定，不自动改

  const symbol = selected?.symbol;

  // ====== 持久化：关键状态写入 localStorage ======
  useEffect(() => saveState({ q }), [q]);
  useEffect(() => saveState({ selected }), [selected]);
  useEffect(() => saveState({ tf }), [tf]);
  useEffect(() => saveState({ range }), [range]);
  useEffect(() => saveState({ chartMode }), [chartMode]);
  useEffect(() => saveState({ modeLock: modeAutoGuard.current }), [chartMode, tf, range, selected]);

  // 只要切换到 1m+1d，就默认曲线；否则默认蜡烛K线（除非用户手动锁定）
  useEffect(() => {
    if (modeAutoGuard.current) return;
    if (tf === "1m" && range === "1d") setChartMode("line");
    else setChartMode("candle");
  }, [tf, range]);

  // 搜索（模糊）
  useEffect(() => {
    let cancelled = false;
    async function run() {
      setSearchErr("");
      const query = normalizeQuery(dq);
      if (!query) {
        setCandidates([]);
        return;
      }
      setLoadingSearch(true);
      try {
        const data = await apiGet("/api/search", { q: query });
        const items = (data.items || []).slice().sort((a, b) => rankHKItem(a) - rankHKItem(b));
        if (!cancelled) setCandidates(items);
      } catch (e) {
        if (!cancelled) setSearchErr(String(e.message || e));
      } finally {
        if (!cancelled) setLoadingSearch(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [dq]);

  // 拉 summary
  async function loadSummary(currSymbol) {
    setSummaryErr("");
    setLoadingSummary(true);
    try {
      const data = await apiGet("/api/summary", { symbol: currSymbol });
      setSummary(data);
    } catch (e) {
      setSummaryErr(String(e.message || e));
    } finally {
      setLoadingSummary(false);
    }
  }

  // 拉 k线
  async function loadKline(currSymbol, currTf, currRange) {
    setKErr("");
    setLoadingK(true);
    try {
      const data = await apiGet("/api/kline", { symbol: currSymbol, tf: currTf, range: currRange });
      setKBars(data.bars || []);
    } catch (e) {
      setKErr(String(e.message || e));
    } finally {
      setLoadingK(false);
    }
  }

  // ✅ 刷新按钮：立即刷新 summary + kline
  async function refreshNow() {
    if (!symbol) return;
    await Promise.all([loadSummary(symbol), loadKline(symbol, tf, range)]);
  }

  // “直接查询”：回车/按钮 → 取排序后的第一个
  async function directSelect(queryRaw) {
    const query = normalizeQuery(queryRaw);
    if (!query) return;
    setSearchErr("");
    setLoadingSearch(true);
    try {
      const data = await apiGet("/api/search", { q: query });
      const items = (data.items || []).slice().sort((a, b) => rankHKItem(a) - rankHKItem(b));
      setCandidates(items);

      if (items.length > 0) {
        const it = items[0];
        setSelected(it);
        setCandidates([]);

        // 新股票默认：若你希望“保持上次 tf/range/mode”，可删除下面三行
        // 这里按你的需求：默认展示 1m+1d
        modeAutoGuard.current = false;
        setTf("1m");
        setRange("1d");
        setChartMode("line");
      }
    } catch (e) {
      setSearchErr(String(e.message || e));
    } finally {
      setLoadingSearch(false);
    }
  }

  // 选中后：加载 summary + kline（并恢复缓存的 tf/range/mode）
  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!symbol) return;
      try {
        await Promise.all([loadSummary(symbol), loadKline(symbol, tf, range)]);
      } catch {
        // ignore
      }
      if (cancelled) return;
    }
    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  // tf/range 变化时，更新 kline
  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!symbol) return;
      await loadKline(symbol, tf, range);
      if (cancelled) return;
    }
    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, tf, range]);

  // 1m 自动刷新（20s）
  useEffect(() => {
    if (!symbol) return;
    if (tf !== "1m") return;
    const t = setInterval(() => {
      Promise.all([loadKline(symbol, tf, range), loadSummary(symbol)]).catch(() => {});
    }, 20000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, tf, range]);

  const chartTitle = symbol ? `${selected?.cn_name || symbol} · ${tf} · ${range}` : "K线";
  const option = useMemo(() => makeChartOption(chartTitle, kBars, chartMode), [chartTitle, kBars, chartMode]);

  // 布局
  const layout = {
    page: {
      maxWidth: 1400,
      margin: "0 auto",
      padding: 16,
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto",
      background: "#f6f7fb",
      minHeight: "100vh",
    },
    header: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" },
    input: { flex: 1, minWidth: 320, padding: "10px 12px", borderRadius: 10, border: "1px solid #ddd" },
    btn: { padding: "10px 14px", borderRadius: 10, border: "1px solid #ddd", background: "white", cursor: "pointer" },

    main: { marginTop: 14, display: "flex", gap: 14, alignItems: "stretch" },
    left: { width: 440, flex: "0 0 440px" },
    right: { flex: "1 1 auto", minWidth: 0 },

    card: { padding: 14, border: "1px solid #e9e9ee", borderRadius: 12, background: "white" },
    muted: { color: "#666", fontSize: 13 },
    statRow: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10, marginTop: 10 },
    stat: { padding: 10, border: "1px solid #f2f2f2", borderRadius: 10, background: "#fafafa" },
    statK: { color: "#666", fontSize: 12 },
    statV: { fontSize: 18, fontWeight: 800, marginTop: 4 },
    controlsRow: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" },
    select: { padding: "8px 10px", borderRadius: 10, border: "1px solid #ddd", background: "white" },
    candidates: { marginTop: 10, border: "1px solid #eee", borderRadius: 12, overflow: "hidden", background: "white" },
    cand: { padding: "10px 12px", cursor: "pointer", display: "flex", justifyContent: "space-between", gap: 12 },
  };

  return (
    <div style={layout.page}>
      <h2 style={{ margin: "6px 0 10px" }}>股票查询（港股中文搜索 + K线）</h2>

      {/* 顶部搜索 */}
      <div style={layout.header}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") directSelect(q);
          }}
          placeholder="输入股票名称模糊搜索，或直接输入代码（如 9988 / 9988.HK / 0700.HK）"
          style={layout.input}
        />
        <button onClick={() => directSelect(q)} style={layout.btn}>
          直接查询
        </button>

        {/* 刷新按钮 */}
        <button
          onClick={refreshNow}
          style={{ ...layout.btn, opacity: !symbol ? 0.6 : 1 }}
          disabled={!symbol}
          title="立刻刷新 summary + kline"
        >
          刷新
        </button>

        <button
          onClick={() => {
            setQ("");
            setCandidates([]);
            setSelected(null);
            setSummary(null);
            setKBars([]);
            modeAutoGuard.current = false;
            setTf("1m");
            setRange("1d");
            setChartMode("line");
            saveState({ q: "", selected: null, tf: "1m", range: "1d", chartMode: "line", modeLock: false });
          }}
          style={layout.btn}
        >
          清空
        </button>
      </div>

      <div style={{ marginTop: 6, ...layout.muted }}>
        {loadingSearch ? "搜索中..." : searchErr ? `搜索失败：${searchErr}` : ""}
      </div>

      {/* 候选列表 */}
      {candidates.length > 0 && (
        <div style={layout.candidates}>
          {candidates.slice(0, 12).map((it, idx) => (
            <div
              key={`${it.symbol}-${idx}`}
              onClick={() => {
                setSelected(it);
                setCandidates([]);

                // 选中后：默认 1m+1d + 曲线（并写入缓存）
                modeAutoGuard.current = false;
                setTf("1m");
                setRange("1d");
                setChartMode("line");
                saveState({ selected: it, tf: "1m", range: "1d", chartMode: "line", modeLock: false });
              }}
              style={{
                ...layout.cand,
                borderTop: idx === 0 ? "none" : "1px solid #f2f2f2",
              }}
            >
              <div style={{ fontWeight: 700 }}>{buildDisplay(it)}</div>
              <div style={layout.muted}>{it.symbol}</div>
            </div>
          ))}
        </div>
      )}

      {/* 主体 */}
      <div style={layout.main} className="mainWrap">
        {/* 左侧：信息+控制 */}
        <div style={{ ...layout.left, ...layout.card }}>
          {!selected ? (
            <div style={layout.muted}>请选择或直接查询一个股票。</div>
          ) : (
            <>
              <div style={{ fontSize: 18, fontWeight: 900 }}>{buildDisplay(selected)}</div>
              <div style={{ ...layout.muted, marginTop: 4 }}>symbol: {selected.symbol}</div>

              <div style={layout.statRow}>
                <div style={layout.stat}>
                  <div style={layout.statK}>当前价格</div>
                  <div style={layout.statV}>{fmtNum(summary?.price)}</div>
                </div>
                <div style={layout.stat}>
                  <div style={layout.statK}>涨跌幅</div>
                  <div style={layout.statV}>{fmtPct(summary?.pctChange)}</div>
                </div>
                <div style={layout.stat}>
                  <div style={layout.statK}>半年最高</div>
                  <div style={layout.statV}>{fmtNum(summary?.high6m)}</div>
                </div>
                <div style={layout.stat}>
                  <div style={layout.statK}>一年最高</div>
                  <div style={layout.statV}>{fmtNum(summary?.high1y)}</div>
                </div>
              </div>

              <div style={{ marginTop: 10, ...layout.muted }}>
                {loadingSummary ? "加载行情..." : summaryErr ? `summary 失败：${summaryErr}` : ""}
              </div>

              <hr style={{ margin: "14px 0", border: "none", borderTop: "1px solid #f0f0f0" }} />

              <div style={layout.controlsRow}>
                <div style={{ fontWeight: 700 }}>周期：</div>
                <select
                  value={tf}
                  onChange={(e) => {
                    modeAutoGuard.current = false;
                    setTf(e.target.value);
                    saveState({ tf: e.target.value, modeLock: false });
                  }}
                  style={layout.select}
                >
                  <option value="1m">分K 1m</option>
                  <option value="1d">日K 1d</option>
                  <option value="1wk">周K 1wk</option>
                  <option value="1mo">月K 1mo</option>
                </select>

                <div style={{ fontWeight: 700 }}>范围：</div>
                <select
                  value={range}
                  onChange={(e) => {
                    modeAutoGuard.current = false;
                    setRange(e.target.value);
                    saveState({ range: e.target.value, modeLock: false });
                  }}
                  style={layout.select}
                >
                  <option value="1d">1d</option>
                  <option value="5d">5d</option>
                  <option value="1mo">1mo</option>
                  <option value="6mo">6mo</option>
                  <option value="1y">1y</option>
                  <option value="2y">2y</option>
                  <option value="5y">5y</option>
                </select>

                {/* 曲线 / K线 切换按钮（会写入缓存，并锁定手动模式） */}
                <button
                  style={layout.btn}
                  onClick={() => {
                    modeAutoGuard.current = true;
                    const next = chartMode === "line" ? "candle" : "line";
                    setChartMode(next);
                    saveState({ chartMode: next, modeLock: true });
                  }}
                  title="切换图表类型：曲线 / 蜡烛K线"
                >
                  {chartMode === "line" ? "切换为K线" : "切换为曲线"}
                </button>

                <div style={{ marginLeft: "auto", ...layout.muted }}>
                  {loadingK ? "加载K线..." : kErr ? `K线失败：${kErr}` : tf === "1m" ? "分K自动刷新：20s" : ""}
                </div>
              </div>

              <div style={{ marginTop: 10, ...layout.muted }}>
                已启用缓存：刷新/重新打开页面会保持上次股票、周期、范围、曲线/K线选择。
              </div>
            </>
          )}
        </div>

        {/* 右侧：图表 */}
        <div style={{ ...layout.right, ...layout.card }}>
          {!selected ? (
            <div style={layout.muted}>右侧将显示图表。</div>
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

        {/* 响应式：小屏上下布局 */}
        <style>{`
          @media (max-width: 1100px) {
            .mainWrap { flex-direction: column; }
          }
        `}</style>
      </div>
    </div>
  );
}
