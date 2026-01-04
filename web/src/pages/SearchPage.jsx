import React, { useEffect, useMemo, useRef, useState } from "react";
import StockHeader from "../components/StockHeader";
import CandidateList from "../components/CandidateList";
import StockSidebar from "../components/StockSidebar";
import StockChart from "../components/StockChart";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { apiGet } from "../services/api";
import { loadState, saveState } from "../utils/storage";
import { normalizeQuery, rankHKItem } from "../utils/search";
import { makeChartOption } from "../charts/option";

const LS_PAGE = "stock_project_search_page_v1";

export default function SearchPage({ onAddWatch }) {
  const cached = useMemo(() => loadState(LS_PAGE), []);

  const [q, setQ] = useState(cached?.q ?? "");
  const dq = useDebouncedValue(q, 250);

  const [candidates, setCandidates] = useState([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [searchErr, setSearchErr] = useState("");

  const [selected, setSelected] = useState(cached?.selected ?? null);
  const symbol = selected?.symbol;

  const [summary, setSummary] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [summaryErr, setSummaryErr] = useState("");

  const [tf, setTf] = useState(cached?.tf ?? "1m");
  const [range, setRange] = useState(cached?.range ?? "1d");
  const [kBars, setKBars] = useState([]);
  const [loadingK, setLoadingK] = useState(false);
  const [kErr, setKErr] = useState("");

  const initChartMode =
    cached?.chartMode ?? (tf === "1m" && range === "1d" ? "line" : "candle");
  const [chartMode, setChartMode] = useState(initChartMode);
  const modeLockRef = useRef(!!cached?.modeLock);

  // persist
  useEffect(() => saveState(LS_PAGE, { q }), [q]);
  useEffect(() => saveState(LS_PAGE, { selected }), [selected]);
  useEffect(() => saveState(LS_PAGE, { tf }), [tf]);
  useEffect(() => saveState(LS_PAGE, { range }), [range]);
  useEffect(() => saveState(LS_PAGE, { chartMode, modeLock: modeLockRef.current }), [chartMode]);

  // auto mode
  useEffect(() => {
    if (modeLockRef.current) return;
    setChartMode(tf === "1m" && range === "1d" ? "line" : "candle");
  }, [tf, range]);

  async function loadSummary(sym) {
    setSummaryErr("");
    setLoadingSummary(true);
    try {
      const data = await apiGet("/api/summary", { symbol: sym });
      setSummary(data);
    } catch (e) {
      setSummaryErr(String(e.message || e));
    } finally {
      setLoadingSummary(false);
    }
  }

  async function loadKline(sym, tf0, range0) {
    setKErr("");
    setLoadingK(true);
    try {
      const data = await apiGet("/api/kline", { symbol: sym, tf: tf0, range: range0 });
      setKBars(data.bars || []);
    } catch (e) {
      setKErr(String(e.message || e));
    } finally {
      setLoadingK(false);
    }
  }

  async function refreshNow() {
    if (!symbol) return;
    await Promise.all([loadSummary(symbol), loadKline(symbol, tf, range)]);
  }

  // search
  useEffect(() => {
    let cancelled = false;
    (async () => {
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
    })();
    return () => (cancelled = true);
  }, [dq]);

  function selectItem(it, { resetDefault = true } = {}) {
    setSelected(it);
    setCandidates([]);
    if (resetDefault) {
      modeLockRef.current = false;
      setTf("1m");
      setRange("1d");
      setChartMode("line");
      saveState(LS_PAGE, { selected: it, tf: "1m", range: "1d", chartMode: "line", modeLock: false });
    } else {
      saveState(LS_PAGE, { selected: it });
    }
  }

  async function directSelect(queryRaw) {
    const query = normalizeQuery(queryRaw);
    if (!query) return;
    setSearchErr("");
    setLoadingSearch(true);
    try {
      const data = await apiGet("/api/search", { q: query });
      const items = (data.items || []).slice().sort((a, b) => rankHKItem(a) - rankHKItem(b));
      setCandidates(items);
      if (items.length > 0) selectItem(items[0], { resetDefault: true });
    } catch (e) {
      setSearchErr(String(e.message || e));
    } finally {
      setLoadingSearch(false);
    }
  }

  function clearAll() {
    setQ("");
    setCandidates([]);
    setSelected(null);
    setSummary(null);
    setKBars([]);
    modeLockRef.current = false;
    setTf("1m");
    setRange("1d");
    setChartMode("line");
    saveState(LS_PAGE, { q: "", selected: null, tf: "1m", range: "1d", chartMode: "line", modeLock: false });
  }

  // initial load when selected changes
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!symbol) return;
      await Promise.all([loadSummary(symbol), loadKline(symbol, tf, range)]);
      if (cancelled) return;
    })();
    return () => (cancelled = true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  // reload kline when tf/range changes
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!symbol) return;
      await loadKline(symbol, tf, range);
      if (cancelled) return;
    })();
    return () => (cancelled = true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, tf, range]);

  // auto refresh (1m)
  useEffect(() => {
    if (!symbol || tf !== "1m") return;
    const t = setInterval(() => {
      Promise.all([loadKline(symbol, tf, range), loadSummary(symbol)]).catch(() => {});
    }, 20000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, tf, range]);

  const chartTitle = symbol ? `${selected?.cn_name || symbol} · ${tf} · ${range}` : "K线";
  const option = useMemo(() => makeChartOption(chartTitle, kBars, chartMode), [chartTitle, kBars, chartMode]);

  return (
    <>
      <StockHeader
        q={q}
        setQ={setQ}
        onEnter={() => directSelect(q)}
        onDirect={() => directSelect(q)}
        onRefresh={refreshNow}
        refreshDisabled={!symbol}
        onClear={clearAll}
        loadingSearch={loadingSearch}
        searchErr={searchErr}
      />

      <CandidateList
        items={candidates}
        onPick={(it) => selectItem(it, { resetDefault: true })}
        onAddWatch={(it) => onAddWatch(it)}
      />

      <div style={styles.main} className="mainWrap">
        <StockSidebar
          selected={selected}
          summary={summary}
          loadingSummary={loadingSummary}
          summaryErr={summaryErr}
          tf={tf}
          setTf={(v) => {
            modeLockRef.current = false;
            setTf(v);
            saveState(LS_PAGE, { tf: v, modeLock: false });
          }}
          range={range}
          setRange={(v) => {
            modeLockRef.current = false;
            setRange(v);
            saveState(LS_PAGE, { range: v, modeLock: false });
          }}
          chartMode={chartMode}
          onToggleMode={() => {
            modeLockRef.current = true;
            const next = chartMode === "line" ? "candle" : "line";
            setChartMode(next);
            saveState(LS_PAGE, { chartMode: next, modeLock: true });
          }}
          loadingK={loadingK}
          kErr={kErr}
        />

        <StockChart selected={selected} option={option} />

        <style>{`
          @media (max-width: 1100px) { .mainWrap { flex-direction: column; } }
        `}</style>
      </div>
    </>
  );
}

const styles = {
  main: { marginTop: 14, display: "flex", gap: 14, alignItems: "stretch" },
};
