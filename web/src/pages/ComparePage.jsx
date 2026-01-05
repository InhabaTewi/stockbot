import React, { useEffect, useState, useMemo } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import ReactECharts from "echarts-for-react";
import { apiGet } from "../services/api";
import { getValue, setValue } from "../utils/storage";

const LS_COMPARE = "stock_project_compare_v1";
const LS_WATCH = "stock_project_watchlist_v1";

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
  const [selectedIndex, setSelectedIndex] = useState(null); // for rates calculation

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
  }, [selectedStocks, chartType, yAxisType, rangeType]);

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
      const current = bars[index][2]; // close
      const first = bars[0][1]; // open of first bar
      const rate = first !== 0 ? (current - first) / first : 0;
      return { symbol: stock.symbol, rate: Math.max(-1, Math.min(1, rate)) };
    });
  }, [selectedStocks, klineData, selectedIndex]);

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
        name: stock.symbol,
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
      legend: { data: selectedStocks.map(s => s.symbol) },
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
    <div style={{ display: 'flex', height: '100vh' }}>
      {/* Left Panel: Stock Selection */}
      <div style={{ width: '300px', padding: '20px', borderRight: '1px solid #ccc' }}>
        <h3>选择股票</h3>
        <input
          type="text"
          placeholder="搜索股票..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ width: '100%', marginBottom: '10px' }}
        />
        {searchResults.map(stock => (
          <div key={stock.symbol} onClick={() => addStock(stock)} style={{ cursor: 'pointer', padding: '5px' }}>
            {stock.symbol} - {stock.name}
          </div>
        ))}
        <h4>监控列表</h4>
        {watchlist.map(stock => (
          <div key={stock.symbol} onClick={() => addStock(stock)} style={{ cursor: 'pointer', padding: '5px' }}>
            {stock.name || stock.symbol}
          </div>
        ))}
        <h4>已选股票</h4>
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
                        style={{ padding: '5px', margin: '5px 0', background: '#f0f0f0', ...provided.draggableProps.style }}
                      >
                        {stock.name || stock.symbol}
                        <button onClick={() => removeStock(stock.symbol)} style={{ float: 'right' }}>移除</button>
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
      <div style={{ flex: 1, padding: '20px' }}>
        <div>
          <button onClick={() => { setChartType('minute'); setYAxisType('percentage'); setRangeType('1d'); }}>分K线</button>
          <button onClick={() => { setChartType('daily'); setYAxisType('price'); setRangeType('4mo'); }}>日内K线</button>          {chartType === 'daily' && (
            <>
              <select value={rangeType} onChange={(e) => setRangeType(e.target.value)}>
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
                  <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
                  <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
                </>
              )}
            </>
          )}
          <button onClick={() => setYAxisType(yAxisType === 'price' ? 'percentage' : 'price')}>
            {yAxisType === 'price' ? '切换到百分比' : '切换到价格'}
          </button>        </div>
        {loading ? <div>加载中...</div> : <ReactECharts option={option} style={{ height: '500px' }} onEvents={onChartEvents} />}
      </div>

      {/* Right Panel: Rates */}
      <div style={{ width: '300px', padding: '20px', borderLeft: '1px solid #ccc' }}>
        <h3>涨跌速率</h3>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="order">按顺序</option>
          <option value="rate">按速率</option>
        </select>
        {sortedRates.map(item => (
          <div key={item.symbol} style={{ padding: '5px', margin: '5px 0' }}>
            {item.symbol}: {(item.rate * 100).toFixed(2)}%
          </div>
        ))}
        <h3>高低价</h3>
        {selectedStocks.map(stock => {
          const summary = summaryData[stock.symbol];
          return (
            <div key={stock.symbol} style={{ padding: '5px', margin: '5px 0' }}>
              <strong>{stock.symbol}</strong><br/>
              6个月: 高 {summary?.high6m?.toFixed(2) || 'N/A'} 低 {summary?.low6m?.toFixed(2) || 'N/A'}<br/>
              1年: 高 {summary?.high1y?.toFixed(2) || 'N/A'} 低 {summary?.low1y?.toFixed(2) || 'N/A'}<br/>
              2年: 高 {summary?.high2y?.toFixed(2) || 'N/A'} 低 {summary?.low2y?.toFixed(2) || 'N/A'}
            </div>
          );
        })}
      </div>
    </div>
  );
}
