#!/bin/bash

set -euo pipefail

PROJECT_DIR="/proj/stock_project"
WEB_DIR="$PROJECT_DIR/web"
RUN_DIR="$PROJECT_DIR/.run"
LOG_DIR="$PROJECT_DIR/.logs"
PID_FILE="$RUN_DIR/frontend.pid"
LOG_FILE="$LOG_DIR/frontend.log"
PORT="5173"

mkdir -p "$RUN_DIR" "$LOG_DIR"

if [ -f "$PID_FILE" ]; then
	OLD_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
	if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
		echo "Frontend already running (PID: $OLD_PID)"
		exit 0
	fi
	rm -f "$PID_FILE"
fi

cd "$WEB_DIR"
nohup setsid npm run dev >> "$LOG_FILE" 2>&1 &
PID="$!"
echo "$PID" > "$PID_FILE"

for _ in $(seq 1 30); do
	if curl -fsS -o /dev/null "http://127.0.0.1:${PORT}/" 2>/dev/null; then
		echo "Frontend started at http://0.0.0.0:${PORT}/ (PID: $PID)"
		exit 0
	fi
	sleep 1
done

echo "Frontend launched (PID: $PID), still initializing. Check: $LOG_FILE"