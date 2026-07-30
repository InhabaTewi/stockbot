#!/bin/bash

set -euo pipefail

PROJECT_DIR="/proj/stock_project"
PID_FILE="$PROJECT_DIR/.run/firecrawl-compat.pid"

if [ -f "$PID_FILE" ]; then
	PID="$(cat "$PID_FILE" 2>/dev/null || true)"
	if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
		kill -- -"$PID" 2>/dev/null || kill "$PID" 2>/dev/null || true
	fi
	rm -f "$PID_FILE"
fi

if command -v podman-compose >/dev/null 2>&1; then
	(
		cd "$PROJECT_DIR/infra/news"
		podman-compose -f searxng-compose.yml down
	)
fi

echo "News infrastructure stopped."