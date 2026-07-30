# 股票资讯抓取实验服务

该服务把资讯链路从主站拆成独立微服务：

1. SearxNG 按股票名称、代码和业务关键词发现近一个月资讯。
2. Firecrawl 的 `/v1/scrape` 提取正文和页面元数据。
3. `deepseek-chat` 以 JSON 模式判断股票相关性、政治敏感风险并生成摘要与情绪标签。
4. 全部结果写入独立 SQLite 审计库；只有 `approved`、相关且非敏感的文章会从 `/v1/articles` 发布。
5. 主站同步接口通过 HTTP 消费发布接口，并幂等写入 MySQL `stock_news_articles`；资讯页面只读主站数据库。

实验标的是小米集团-W（`1810.HK`）和智谱（`2513.HK`）。

## 配置

服务会读取 `/proj/.env`。已有的 `DEEPSEEK_API_KEY` 会自动复用，也可使用以下变量覆盖：

```dotenv
SEARXNG_URL=http://127.0.0.1:8088
FIRECRAWL_URL=http://127.0.0.1:3002
FIRECRAWL_API_KEY=
NEWS_REVIEW_API_URL=https://api.deepseek.com/v1/chat/completions
NEWS_REVIEW_API_KEY=
NEWS_REVIEW_MODEL=deepseek-chat
NEWS_DATABASE_PATH=/proj/stock_project/data/news_crawler.db
NEWS_CRAWLER_URL=http://127.0.0.1:8010
NEWS_SYNC_INTERVAL_SECONDS=1800
```

## 启动和同步

当前主机使用 Podman 运行 SearxNG，并在本机以兼容 Firecrawl `/v1/scrape` 协议的轻量正文抽取服务承接实验流量。运行：

```bash
./scripts/start_all.sh
```

`start_all.sh` 会启动 SearxNG、正文抽取服务、资讯微服务、主 API 和前端。主 API 默认每 30 分钟自动执行一次两只实验股票的抓取和 MySQL 同步；可用 `NEWS_SYNC_INTERVAL_SECONDS` 调整，最小 300 秒。后台“立即抓取并同步”可随时手动触发同一条链路。

兼容抽取服务使用 Trafilatura 提取公开网页正文，并保持 Firecrawl v1 响应格式；后续部署官方 Firecrawl 时只需将 `FIRECRAWL_URL` 指向官方服务，爬虫调用方无需修改。

接口：

- `GET http://127.0.0.1:8010/health`：依赖配置和入库状态。
- `GET http://127.0.0.1:8010/v1/stocks`：实验股票。
- `POST http://127.0.0.1:8010/v1/crawl`：执行同步。
- `GET http://127.0.0.1:8010/v1/articles`：仅返回审核通过文章。
- `POST http://127.0.0.1:8000/api/news/sync`：将审核通过资讯同步到主站 MySQL。
- `GET http://127.0.0.1:8000/api/news`：读取主站 MySQL 的股票资讯。

## 资讯后台

主站顶部的“后台”页用于管理模型和审核流程：

- 默认关闭人工审核，模型判定相关且无敏感风险后自动发布。
- 自动审核与定时抓取是两项独立配置：关闭人工审核不会立即发起抓取；定时任务或后台“立即抓取并同步”负责产生新资讯。
- 开启人工审核后，模型通过的内容状态变为 `pending`，必须在后台批准后才会发布；模型判敏感或不相关的内容仍直接拒绝。
- 可配置 OpenAI 兼容接口地址、模型名称和 API Key。API Key 只显示是否已配置，不会回传到浏览器；留空保存会保留现有密钥。
- 审核列表可查看待审核、已通过、已拒绝和处理失败记录，人工操作写入 `review_actions` 审计表。
- 模型和审核设置保存在爬虫服务 SQLite 的 `app_settings` 表，保存后下一次抓取立即生效，无需重启。

管理接口通过主站 `/api/news/admin/*` 代理到资讯微服务。当前项目没有用户登录体系，因此后台应仅在可信内网使用；正式对外部署前需在主站增加管理员身份认证。

## 世界大模型排名

资讯页的“世界大模型排名”页签聚合以下公开数据：

- Artificial Analysis 的综合智能、编程能力和智能体能力榜单。页面直接嵌入原站图表，同时每 12 小时采集一次结构化排名并写入本地快照。
- OpenRouter 的周使用量榜单。由于原站设置了 `frame-ancestors 'self'`，不能跨站嵌入；主站改用其公开排名接口每小时更新本地表格，并保留原榜链接。

排名快照默认保存在 `data/model_rankings.sqlite3`，可用 `MODEL_RANKINGS_DB_PATH` 覆盖。Artificial Analysis 从第二份快照开始比较模型名与名次，变化记录中的正数表示排名上升，负数表示排名下降。

接口：

- `GET http://127.0.0.1:8000/api/news/model-rankings`：读取最近快照和排名变化。
- `POST http://127.0.0.1:8000/api/news/model-rankings/refresh`：立即刷新全部排名来源。

## 安全边界

- 审核请求失败、返回格式错误或正文抓取失败时状态为 `failed`，不会发布。
- 被判定为敏感或与股票无关的文章状态为 `rejected`，仅保留在审计库。
- 资讯微服务只监听 `127.0.0.1:8010`，SearxNG 只绑定本机。不要把抓取触发接口直接暴露到公网。
- 模型审核是发布前初筛，不替代人工合规审核；生产环境应增加人工复核、来源白名单、访问鉴权和审计留存策略。