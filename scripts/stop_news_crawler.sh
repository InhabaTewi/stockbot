#!/bin/bash

set -euo pipefail

PROJECT_DIR="/proj/stock_project"
PID_FILE="$PROJECT_DIR/.run/news-crawler.pid"
PORT="8010"
stopped="0"

if [ -f "$PID_FILE" ]; then
	PID="$(cat "$PID_FILE" 2>/dev/null || true)"
	if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
		kill "$PID" 2>/dev/null || true
		stopped="1"
	fi
fi

PORT_PIDS="$(lsof -ti:"$PORT" 2>/dev/null || true)"
if [ -n "$PORT_PIDS" ]; then
	echo "$PORT_PIDS" | xargs -r kill -9 2>/dev/null || true
	stopped="1"
fi
rm -f "$PID_FILE"

if [ "$stopped" = "1" ]; then
	echo "News crawler stopped."
else
	echo "News crawler was not running."
fi