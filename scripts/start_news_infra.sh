#!/bin/bash

set -euo pipefail

PROJECT_DIR="/proj/stock_project"
RUN_DIR="$PROJECT_DIR/.run"
LOG_DIR="$PROJECT_DIR/.logs"
PID_FILE="$RUN_DIR/firecrawl-compat.pid"
LOG_FILE="$LOG_DIR/firecrawl-compat.log"

mkdir -p "$RUN_DIR" "$LOG_DIR"

if curl -fsS http://127.0.0.1:8088/healthz >/dev/null 2>&1; then
	echo "SearxNG already running on port 8088."
elif command -v podman-compose >/dev/null 2>&1; then
	(
		cd "$PROJECT_DIR/infra/news"
		podman-compose -f searxng-compose.yml up -d
	)
else
	echo "Warning: podman-compose is unavailable; SearxNG was not started."
fi

if curl -fsS http://127.0.0.1:3002/health >/dev/null 2>&1; then
	echo "Article extractor already running on port 3002."
	exit 0
fi

if [ -f "$PID_FILE" ]; then
	OLD_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
	if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
		kill "$OLD_PID" 2>/dev/null || true
	fi
	rm -f "$PID_FILE"
fi

cd "$PROJECT_DIR"
nohup setsid conda run --no-capture-output -n testenv uvicorn news_crawler.firecrawl_compat:app --host 127.0.0.1 --port 3002 >> "$LOG_FILE" 2>&1 &
PID="$!"
echo "$PID" > "$PID_FILE"

if curl -fsS --retry 20 --retry-connrefused --retry-delay 1 --max-time 30 http://127.0.0.1:3002/health >/dev/null; then
	echo "SearxNG available at http://127.0.0.1:8088"
	echo "Firecrawl-compatible extractor available at http://127.0.0.1:3002 (PID: $PID)"
else
	echo "Extractor failed to become ready. Check: $LOG_FILE"
	exit 1
fi