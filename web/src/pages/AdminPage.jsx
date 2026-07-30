import React, { useEffect, useState } from "react";
import { apiGet, apiPost, apiPut } from "../services/api";

const REVIEW_FILTERS = [
  { value: "pending", label: "待人工审核" },
  { value: "approved", label: "已通过" },
  { value: "rejected", label: "已拒绝" },
  { value: "failed", label: "处理失败" },
];

const STATUS_LABELS = {
  pending: "待人工审核",
  approved: "已通过",
  rejected: "已拒绝",
  failed: "处理失败",
};

function formatTime(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function AdminPage() {
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [filter, setFilter] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadSettings() {
    const data = await apiGet("/api/news/admin/settings");
    setSettings(data);
    setForm({
      manual_review_enabled: data.manual_review_enabled,
      review_api_url: data.review_api_url,
      review_model: data.review_model,
      review_api_key: "",
    });
  }

  async function loadReviews(status = filter) {
    const data = await apiGet("/api/news/admin/reviews", { status, limit: 100 });
    setReviews(data.items || []);
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiGet("/api/news/admin/settings"),
      apiGet("/api/news/admin/reviews", { status: "pending", limit: 100 }),
    ])
      .then(([settingsData, reviewsData]) => {
        if (cancelled) return;
        setSettings(settingsData);
        setForm({
          manual_review_enabled: settingsData.manual_review_enabled,
          review_api_url: settingsData.review_api_url,
          review_model: settingsData.review_model,
          review_api_key: "",
        });
        setReviews(reviewsData.items || []);
      })
      .catch((requestError) => {
        if (!cancelled) setError(requestError.message || "后台数据加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveSettings(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    const payload = { ...form };
    if (!payload.review_api_key) delete payload.review_api_key;
    try {
      const data = await apiPut("/api/news/admin/settings", payload);
      setSettings(data);
      setForm((current) => ({ ...current, review_api_key: "" }));
      setMessage("配置已保存");
    } catch (requestError) {
      setError(requestError.message || "配置保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function changeFilter(nextFilter) {
    setFilter(nextFilter);
    setError("");
    try {
      await loadReviews(nextFilter);
    } catch (requestError) {
      setError(requestError.message || "审核记录加载失败");
    }
  }

  async function decide(articleId, decision) {
    setError("");
    setMessage("");
    try {
      await apiPost(`/api/news/admin/reviews/${articleId}/decision`, {
        decision,
        note: decision === "approved" ? "后台人工审核通过" : "后台人工审核拒绝",
      });
      await Promise.all([loadSettings(), loadReviews(filter)]);
      setMessage(decision === "approved" ? "资讯已批准发布" : "资讯已拒绝");
    } catch (requestError) {
      setError(requestError.message || "审核操作失败");
    }
  }

  async function runPipeline() {
    setRunning(true);
    setError("");
    setMessage("");
    try {
      const result = await apiPost("/api/news/admin/run", {});
      const stocks = Object.values(result.crawl?.items || {});
      const approved = stocks.reduce((total, item) => total + (item.approved || 0), 0);
      const failed = stocks.reduce((total, item) => total + (item.failed || 0), 0);
      setMessage(`抓取完成：通过 ${approved} 条，失败 ${failed} 项，同步 ${result.sync?.synced || 0} 条`);
      await Promise.all([loadSettings(), loadReviews(filter)]);
    } catch (requestError) {
      setError(requestError.message || "抓取任务执行失败");
    } finally {
      setRunning(false);
    }
  }

  if (loading) return <section className="admin-state">正在加载后台配置...</section>;
  if (!form) return <section className="admin-state is-error">{error || "后台暂不可用"}</section>;

  const counts = settings?.counts || {};
  return (
    <section className="admin-page" aria-labelledby="admin-title">
      <header className="admin-header">
        <div>
          <span className="admin-kicker">NEWS OPERATIONS</span>
          <h3 id="admin-title">资讯后台</h3>
        </div>
        <div className={`admin-mode ${form.manual_review_enabled ? "is-manual" : "is-auto"}`}>
          <span>{form.manual_review_enabled ? "人工复核" : "全自动"}</span>
          <strong>{form.review_model}</strong>
        </div>
      </header>

      {(error || message) && (
        <div className={`admin-notice ${error ? "is-error" : "is-success"}`} role="status">
          {error || message}
        </div>
      )}

      <div className="admin-layout">
        <form className="admin-settings" onSubmit={saveSettings}>
          <div className="admin-section-heading">
            <div>
              <span>MODEL</span>
              <h4>审核模型</h4>
            </div>
            <span className={`admin-key-state ${settings?.review_api_key_configured ? "is-ready" : ""}`}>
              {settings?.review_api_key_configured ? "密钥已配置" : "密钥未配置"}
            </span>
          </div>

          <label className="admin-field">
            <span>模型名称</span>
            <input
              value={form.review_model}
              onChange={(event) => setForm({ ...form, review_model: event.target.value })}
              required
            />
          </label>
          <label className="admin-field">
            <span>兼容接口地址</span>
            <input
              type="url"
              value={form.review_api_url}
              onChange={(event) => setForm({ ...form, review_api_url: event.target.value })}
              required
            />
          </label>
          <label className="admin-field">
            <span>API 密钥</span>
            <input
              type="password"
              value={form.review_api_key}
              onChange={(event) => setForm({ ...form, review_api_key: event.target.value })}
              placeholder={settings?.review_api_key_configured ? "留空保持现有密钥" : "输入 API 密钥"}
              autoComplete="new-password"
            />
          </label>

          <label className="admin-review-toggle">
            <span>
              <strong>人工审核</strong>
              <small>开启后，模型通过的资讯进入待审核队列</small>
            </span>
            <input
              type="checkbox"
              checked={form.manual_review_enabled}
              onChange={(event) => setForm({ ...form, manual_review_enabled: event.target.checked })}
            />
            <span className="admin-switch" aria-hidden="true" />
          </label>

          <button className="admin-save" type="submit" disabled={saving}>
            {saving ? "保存中..." : "保存配置"}
          </button>

          <div className="admin-services">
            <div className="admin-section-heading">
              <div><span>SERVICES</span><h4>抓取服务</h4></div>
            </div>
            {Object.entries(settings?.dependencies || {}).map(([name, service]) => (
              <div className="admin-service-row" key={name}>
                <span className={service.ok ? "is-online" : "is-offline"} aria-hidden="true" />
                <strong>{name === "searxng" ? "SearxNG" : "Firecrawl"}</strong>
                <small>{service.ok ? "可用" : "未连接"}</small>
              </div>
            ))}
            <button className="admin-run" type="button" disabled={running} onClick={runPipeline}>
              {running ? "抓取中..." : "立即抓取并同步"}
            </button>
          </div>
        </form>

        <div className="admin-review-panel">
          <div className="admin-metrics">
            {REVIEW_FILTERS.map((item) => (
              <button
                key={item.value}
                type="button"
                className={filter === item.value ? "active" : ""}
                onClick={() => changeFilter(item.value)}
              >
                <strong>{counts[item.value] || 0}</strong>
                <span>{item.label}</span>
              </button>
            ))}
          </div>

          <div className="admin-review-heading">
            <div>
              <span>REVIEW QUEUE</span>
              <h4>{STATUS_LABELS[filter]}</h4>
            </div>
            <span>{reviews.length} 条</span>
          </div>

          <div className="admin-review-list">
            {reviews.length === 0 ? (
              <div className="admin-empty">当前没有{STATUS_LABELS[filter]}的资讯</div>
            ) : reviews.map((article) => (
              <article className="admin-review-item" key={article.id}>
                <div className="admin-review-meta">
                  <span>{article.stock_name} · {article.symbol}</span>
                  <time>{formatTime(article.updated_at)}</time>
                </div>
                <h5>{article.title}</h5>
                <p>{article.summary || article.review_reason || "暂无摘要"}</p>
                <div className="admin-review-footer">
                  <a href={article.url} target="_blank" rel="noreferrer">查看原文</a>
                  {article.review_status === "pending" && form.manual_review_enabled ? (
                    <div className="admin-review-actions">
                      <button type="button" className="is-reject" onClick={() => decide(article.id, "rejected")}>拒绝</button>
                      <button type="button" className="is-approve" onClick={() => decide(article.id, "approved")}>批准</button>
                    </div>
                  ) : (
                    <span className={`admin-status is-${article.review_status}`}>{STATUS_LABELS[article.review_status]}</span>
                  )}
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}