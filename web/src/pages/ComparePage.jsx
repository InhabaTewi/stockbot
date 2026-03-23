import React, { useEffect, useState, useMemo } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import ReactECharts from "echarts-for-react";
import { apiGet } from "../services/api";
import { getValue, setValue } from "../utils/storage";
import { buildDisplay } from "../utils/format";

const LS_COMPARE = "stock_project_compare_v1";
const LS_WATCH = "stock_project_watchlist_v1";

const RATE_WINDOW_OPTIONS = [
  { value: '1m', label: '1分钟内', minutes: 1 },
  { value: '3m', label: '3分钟内', minutes: 3 },
  { value: '5m', label: '5分钟内', minutes: 5 },
  { value: '10m', label: '10分钟内', minutes: 10 },
  { value: '30m', label: '半小时内', minutes: 30 },
  { value: '60m', label: '1小时内', minutes: 60 },
  { value: '720m', label: '半天内', minutes: 720 },
  { value: 'dayAvg', label: '全天平均' },
];

function clampRate(rate) {
  return Math.max(-1, Math.min(1, rate));
}

function getRateWindowLabel(rateWindow) {
  return RATE_WINDOW_OPTIONS.find(w => w.value === rateWindow)?.label || '1分钟内';
}

function findAnchorIndexByWindow(bars, endIndex, minutes) {
  if (!Array.isArray(bars) || bars.length === 0) return 0;
  const idx = Math.max(0, Math.min(endIndex, bars.length - 1));
  const endTs = Number(bars[idx]?.[0]) || 0;
  const targetTs = endTs - minutes * 60 * 1000;

  for (let i = idx; i >= 0; i--) {
    const ts = Number(bars[i]?.[0]) || 0;
    if (ts <= targetTs) return i;
  }

  return 0;
}

function calcRateByWindow(bars, endIndex, rateWindow) {
  if (!Array.isArray(bars) || bars.length === 0) return 0;
  const idx = Math.max(0, Math.min(endIndex, bars.length - 1));
  const currentClose = Number(bars[idx]?.[2]);
  if (!Number.isFinite(currentClose)) return 0;

  if (rateWindow === 'dayAvg') {
    let sum = 0;
    let count = 0;
    for (let i = 1; i <= idx; i++) {
      const prevClose = Number(bars[i - 1]?.[2]);
      const close = Number(bars[i]?.[2]);
      if (!Number.isFinite(prevClose) || !Number.isFinite(close) || prevClose === 0) continue;
      sum += (close - prevClose) / prevClose;
      count += 1;
    }
    if (count === 0) return 0;
    return clampRate(sum / count);
  }

  const minutes = RATE_WINDOW_OPTIONS.find(w => w.value === rateWindow)?.minutes ?? 1;
  const anchorIndex = findAnchorIndexByWindow(bars, idx, minutes);
  const anchorOpen = Number(bars[anchorIndex]?.[1]);
  if (!Number.isFinite(anchorOpen) || anchorOpen === 0) return 0;

  return clampRate((currentClose - anchorOpen) / anchorOpen);
}

export default function ComparePage() {
  const [selectedStocks, setSelectedStocks] = useState(() => getValue(`${LS_COMPARE}:stocks`, []));
  const [chartType, setChartType] = useState(() => getValue(`${LS_COMPARE}:chartType`, 'daily'));
  const [yAxisType, setYAxisType] = useState(() => getValue(`${LS_COMPARE}:yAxisType`, 'price'));
  const [rangeType, setRangeType] = useState(() => getValue(`${LS_COMPARE}:rangeType`, '4mo'));
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [klineData, setKlineData] = useState({});
  const [loading, setLoading] = useState(false);
  const [summaryData, setSummaryData] = useState({});
  const [watchlist] = useState(() => getValue(LS_WATCH, []));
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [sortBy, setSortBy] = useState('order'); // 'order' or 'rate'
  const [rateWindow, setRateWindow] = useState(() => getValue(`${LS_COMPARE}:rateWindow`, '1m'));
  const [selectedIndex, setSelectedIndex] = useState(null); // for rates calculation
  const [showRateFormula, setShowRateFormula] = useState(false);

  const displayBySymbol = useMemo(() => {
    const map = {};
    selectedStocks.forEach((stock) => {
      map[stock.symbol] = buildDisplay(stock);
    });
    return map;
  }, [selectedStocks]);

  // Load kline data
  useEffect(() => {
    if (selectedStocks.length === 0) return;
    setLoading(true);
    const promises = selectedStocks.map(stock => {
      const params = {
        symbol: stock.symbol,
        tf: chartType === 'minute' ? '1m' : '1d',
      };
      if (chartType === 'minute') {
        params.range = '1d';
      } else {
        if (rangeType === 'custom' && customStart && customEnd) {
          params.start = Math.floor(new Date(customStart).getTime() / 1000);
          params.end = Math.floor(new Date(customEnd).getTime() / 1000);
        } else {
          params.range = rangeType;
        }
      }
      return apiGet('/api/kline', params).then(data => ({ symbol: stock.symbol, data }));
    });
    Promise.all(promises).then(results => {
      const newData = {};
      results.forEach(({ symbol, data }) => {
        newData[symbol] = data.bars;
      });
      setKlineData(newData);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [selectedStocks, chartType, rangeType, customStart, customEnd]); // eslint-disable-line react-hooks/exhaustive-deps  

  // Load summary data
  useEffect(() => {
    if (selectedStocks.length === 0) return;
    const promises = selectedStocks.map(stock =>
      apiGet('/api/summary', { symbol: stock.symbol }).then(data => ({ symbol: stock.symbol, data }))
    );
    Promise.all(promises).then(results => {
      const newData = {};
      results.forEach(({ symbol, data }) => {
        newData[symbol] = data;
      });
      setSummaryData(newData);
    }).catch(() => {});
  }, [selectedStocks]);

  // Save to localStorage
  useEffect(() => {
    setValue(`${LS_COMPARE}:stocks`, selectedStocks);
    setValue(`${LS_COMPARE}:chartType`, chartType);
    setValue(`${LS_COMPARE}:yAxisType`, yAxisType);
    setValue(`${LS_COMPARE}:rangeType`, rangeType);
    setValue(`${LS_COMPARE}:rateWindow`, rateWindow);
  }, [selectedStocks, chartType, yAxisType, rangeType, rateWindow]);

  // Search stocks
  const handleSearch = async (query) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    try {
      const data = await apiGet('/api/search', { q: query });
      setSearchResults(data.slice(0, 10)); // limit to 10
    } catch {
      setSearchResults([]);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => handleSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Add stock
  const addStock = (stock) => {
    if (!selectedStocks.find(s => s.symbol === stock.symbol)) {
      setSelectedStocks([...selectedStocks, stock]);
    }
    setSearchQuery("");
    setSearchResults([]);
  };

  // Remove stock
  const removeStock = (symbol) => {
    setSelectedStocks(selectedStocks.filter(s => s.symbol !== symbol));
  };

  // Drag and drop
  const onDragEnd = (result) => {
    if (!result.destination) return;
    const items = Array.from(selectedStocks);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    setSelectedStocks(items);
  };

  // Calculate rates
  const rates = useMemo(() => {
    if (!selectedStocks.length) return [];
    return selectedStocks.map(stock => {
      const bars = klineData[stock.symbol];
      if (!bars || bars.length === 0) return { symbol: stock.symbol, rate: 0 };
      const index = selectedIndex !== null ? selectedIndex : bars.length - 1;
      const rate = calcRateByWindow(bars, index, rateWindow);
      return { symbol: stock.symbol, rate };
    });
  }, [selectedStocks, klineData, selectedIndex, rateWindow]);

  // Sorted rates
  const sortedRates = useMemo(() => {
    if (sortBy === 'rate') {
      return [...rates].sort((a, b) => b.rate - a.rate);
    }
    return rates; // order as selectedStocks
  }, [rates, sortBy]);

  // ECharts option
  const option = useMemo(() => {
    const series = selectedStocks.map((stock, idx) => {
      const bars = klineData[stock.symbol] || [];
      let data;
      if (yAxisType === 'percentage') {
        if (chartType === 'minute') {
          // 当日涨跌幅：相对于第一根K线的开盘
          const firstOpen = bars.length > 0 ? bars[0][1] : 1;
          data = bars.map(bar => [bar[0], ((bar[2] - firstOpen) / firstOpen) * 100]);
        } else {
          // 基于第一天的涨跌幅
          const firstClose = bars.length > 0 ? bars[0][2] : 1;
          data = bars.map(bar => [bar[0], ((bar[2] - firstClose) / firstClose) * 100]);
        }
      } else {
        data = bars.map(bar => [bar[0], bar[2]]); // close
      }
      return {
        name: buildDisplay(stock),
        type: 'line',
        data,
        smooth: true,
        lineStyle: { width: 2 },
        itemStyle: { color: `hsl(${idx * 360 / selectedStocks.length}, 70%, 50%)` },
      };
    });
    return {
      tooltip: {
        trigger: 'axis',
        formatter: (params) => {
          const param = params[0];
          return `${param.seriesName}: ${param.value[1].toFixed(2)}${yAxisType === 'percentage' ? '%' : ''}`;
        },
      },
      legend: { data: selectedStocks.map(s => buildDisplay(s)) },
      xAxis: { type: 'time' },
      yAxis: { type: 'value', name: yAxisType === 'percentage' ? '%' : '' },
      series,
      dataZoom: [{ type: 'inside' }, { type: 'slider' }],
    };
  }, [selectedStocks, klineData, yAxisType, chartType]);

  // Handle chart events
  const onChartEvents = {
    mousemove: (params) => {
      if (params.componentType === 'series') {
        setSelectedIndex(params.dataIndex);
      }
    },
    mouseout: () => {
      setSelectedIndex(null);
    },
  };

  return (
    <div className="compare-layout">
      {/* Left Panel: Stock Selection */}
      <div className="compare-panel">
        <h3 className="panel-title" style={{ fontSize: 22, marginBottom: 10 }}>选择股票</h3>
        <input
          type="text"
          placeholder="搜索股票..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="stock-input"
          style={{ width: '100%', marginBottom: '10px', padding: '9px 10px' }}
        />
        {searchResults.map(stock => (
          <div key={stock.symbol} onClick={() => addStock(stock)} style={{ cursor: 'pointer', padding: '7px 6px', borderBottom: '1px dashed rgba(17, 54, 106, 0.1)' }}>
            {buildDisplay(stock)}
          </div>
        ))}
        <h4 style={{ marginBottom: 8 }}>监控列表</h4>
        {watchlist.map(stock => (
          <div key={stock.symbol} onClick={() => addStock(stock)} style={{ cursor: 'pointer', padding: '7px 6px', borderBottom: '1px dashed rgba(17, 54, 106, 0.1)' }}>
            {buildDisplay(stock)}
          </div>
        ))}
        <h4 style={{ marginBottom: 8 }}>已选股票</h4>
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="stocks">
            {(provided) => (
              <div {...provided.droppableProps} ref={provided.innerRef}>
                {selectedStocks.map((stock, index) => (
                  <Draggable key={stock.symbol} draggableId={stock.symbol} index={index}>
                    {(provided) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        {...provided.dragHandleProps}
                        style={{ padding: '9px 10px', margin: '7px 0', background: 'rgba(255,255,255,0.9)', borderRadius: 10, border: '1px solid rgba(32, 74, 130, 0.14)', ...provided.draggableProps.style }}
                      >
                        {buildDisplay(stock)}
                        <button className="stock-button stock-button-danger" onClick={() => removeStock(stock.symbol)} style={{ float: 'right', padding: '4px 10px' }}>移除</button>
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      </div>

      {/* Center: Chart */}
      <div className="compare-chart">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
          <button className="stock-button" style={{ padding: '8px 10px' }} onClick={() => { setChartType('minute'); setYAxisType('percentage'); setRangeType('1d'); }}>分K线</button>
          <button className="stock-button" style={{ padding: '8px 10px' }} onClick={() => { setChartType('daily'); setYAxisType('price'); setRangeType('4mo'); }}>日内K线</button>          {chartType === 'daily' && (
            <>
              <select className="stock-select" style={{ padding: '8px 10px' }} value={rangeType} onChange={(e) => setRangeType(e.target.value)}>
                <option value="1w">1周</option>
                <option value="2w">2周</option>
                <option value="1mo">1月</option>
                <option value="3mo">3月</option>
                <option value="6mo">6月</option>
                <option value="1y">1年</option>
                <option value="custom">自定义</option>
              </select>
              {rangeType === 'custom' && (
                <>
                  <input className="stock-input" style={{ padding: '8px 10px' }} type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
                  <input className="stock-input" style={{ padding: '8px 10px' }} type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
                </>
              )}
            </>
          )}
          <button className="stock-button stock-button-primary" style={{ padding: '8px 12px' }} onClick={() => setYAxisType(yAxisType === 'price' ? 'percentage' : 'price')}>
            {yAxisType === 'price' ? '切换到百分比' : '切换到价格'}
          </button>        </div>
        {loading ? <div className="muted">加载中...</div> : <ReactECharts option={option} style={{ height: '500px' }} onEvents={onChartEvents} />}
      </div>

      {/* Right Panel: Rates */}
      <div className="compare-side">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <h3 className="panel-title" style={{ margin: 0, fontSize: 22 }}>涨跌速率</h3>
          <button
            type="button"
            onClick={() => setShowRateFormula(true)}
            title="查看速率公式"
            aria-label="查看速率公式"
            className="fx-button"
          >
            fx
          </button>
        </div>
        <select className="stock-select" style={{ marginTop: 8, width: '100%', padding: '8px 10px' }} value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="order">按顺序</option>
          <option value="rate">按速率</option>
        </select>
        <div style={{ marginTop: '8px' }}>
          <div className="muted" style={{ fontSize: '12px', marginBottom: '4px' }}>速率计算窗口</div>
          <select className="stock-select" value={rateWindow} onChange={(e) => setRateWindow(e.target.value)} style={{ width: '100%', padding: '8px 10px' }}>
            {RATE_WINDOW_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        {sortedRates.map(item => (
          <div key={item.symbol} style={{ padding: '5px', margin: '5px 0' }}>
            {displayBySymbol[item.symbol] || item.symbol}: {(item.rate * 100).toFixed(2)}%
          </div>
        ))}
        <h3>高低价</h3>
        {selectedStocks.map(stock => {
          const summary = summaryData[stock.symbol];
          return (
            <div key={stock.symbol} style={{ padding: '5px', margin: '5px 0' }}>
              <strong>{buildDisplay(stock)}</strong><br/>
              6个月: 高 {summary?.high6m?.toFixed(2) || 'N/A'} 低 {summary?.low6m?.toFixed(2) || 'N/A'}<br/>
              1年: 高 {summary?.high1y?.toFixed(2) || 'N/A'} 低 {summary?.low1y?.toFixed(2) || 'N/A'}<br/>
              2年: 高 {summary?.high2y?.toFixed(2) || 'N/A'} 低 {summary?.low2y?.toFixed(2) || 'N/A'}
            </div>
          );
        })}
      </div>

      {showRateFormula && (
        <div
          onClick={() => setShowRateFormula(false)}
          className="modal-mask"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="modal-card"
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <strong>涨跌速率计算公式</strong>
              <button
                type="button"
                onClick={() => setShowRateFormula(false)}
                className="stock-button"
                style={{ padding: '4px 8px' }}
              >
                关闭
              </button>
            </div>

            <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', fontSize: '13px', lineHeight: 1.7 }}>
              {rateWindow === 'dayAvg' ? (
                <>
                  <div>per_bar_rate_i = (close_i - close_(i-1)) / close_(i-1)</div>
                  <div>rate_raw = average(per_bar_rate_i), i = 1..current_index</div>
                  <div>rate = max(-1, min(1, rate_raw))</div>
                  <div>显示值 = rate * 100%</div>
                </>
              ) : (
                <>
                  <div>rate_raw = (current_close - window_open) / window_open</div>
                  <div>rate = max(-1, min(1, rate_raw))</div>
                  <div>显示值 = rate * 100%</div>
                </>
              )}
            </div>

            <div style={{ marginTop: '10px', fontSize: '13px', color: '#444', lineHeight: 1.6 }}>
              <div>1. 当前计算窗口：{getRateWindowLabel(rateWindow)}。</div>
              <div>2. current_close：当前对比点收盘价。若鼠标停在图上，取对应点；否则取最新点。</div>
              <div>3. {rateWindow === 'dayAvg' ? 'dayAvg 使用从当日首条到当前点的每根K线收益率均值。' : 'window_open 是“当前点往前回看该窗口”范围内起始K线开盘价。'}</div>
              <div>4. 前端会把速率限制在 [-100%, +100%] 区间，防止极端值影响可读性。</div>
              <div>5. 右侧“涨跌速率”列表展示的是上述显示值。</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
