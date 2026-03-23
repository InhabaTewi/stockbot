#!/bin/bash

set -euo pipefail

PROJECT_DIR="/proj/stock_project"
RUN_DIR="$PROJECT_DIR/.run"
LOG_DIR="$PROJECT_DIR/.logs"
PID_FILE="$RUN_DIR/backend.pid"
LOG_FILE="$LOG_DIR/backend.log"
PORT="8000"

mkdir -p "$RUN_DIR" "$LOG_DIR"

if ! command -v conda >/dev/null 2>&1; then
	echo "Error: conda command not found"
	exit 1
fi

if [ -f "$PID_FILE" ]; then
	OLD_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
	if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
		echo "Backend already running (PID: $OLD_PID)"
		exit 0
	fi
	rm -f "$PID_FILE"
fi

# Project-scoped proxy (opt-in): only this process tree uses Decodo.
DECODO_USER="${DECODO_USER:-sp40emzvtw}"
DECODO_PASS_ENC="${DECODO_PASS_ENC:-Usdu1w%3DijbPa5a4H2R}"
DECODO_HOST="${DECODO_HOST:-au.decodo.com}"
DECODO_PORT="${DECODO_PORT:-30001}"
PROXY_URL="http://${DECODO_USER}:${DECODO_PASS_ENC}@${DECODO_HOST}:${DECODO_PORT}"

export http_proxy="$PROXY_URL"
export https_proxy="$PROXY_URL"
export HTTP_PROXY="$PROXY_URL"
export HTTPS_PROXY="$PROXY_URL"
export no_proxy="${no_proxy:-localhost,127.0.0.1,0.0.0.0,172.16.0.0/12,10.0.0.0/8}"
export NO_PROXY="$no_proxy"

cd "$PROJECT_DIR"
nohup setsid conda run --no-capture-output -n testenv uvicorn server.main:app --reload --host 0.0.0.0 --port "$PORT" >> "$LOG_FILE" 2>&1 &
PID="$!"
echo "$PID" > "$PID_FILE"

for _ in $(seq 1 30); do
	if curl -fsS -o /dev/null "http://127.0.0.1:${PORT}/" 2>/dev/null; then
		echo "Backend started at http://0.0.0.0:${PORT}/ (PID: $PID)"
		exit 0
	fi
	sleep 1
done

echo "Backend launched (PID: $PID), still initializing. Check: $LOG_FILE"