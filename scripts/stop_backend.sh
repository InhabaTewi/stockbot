#!/bin/bash

set -euo pipefail

PROJECT_DIR="/proj/stock_project"
RUN_DIR="$PROJECT_DIR/.run"
PID_FILE="$RUN_DIR/backend.pid"
PORT="8000"

stopped="0"

if [ -f "$PID_FILE" ]; then
	PID="$(cat "$PID_FILE" 2>/dev/null || true)"
	if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
		echo "Stopping backend (PID: $PID)"
		kill "$PID" 2>/dev/null || true
		sleep 1
		if kill -0 "$PID" 2>/dev/null; then
			kill -9 "$PID" 2>/dev/null || true
		fi
		stopped="1"
	fi
fi

PORT_PIDS="$(lsof -ti:"$PORT" 2>/dev/null || true)"
if [ -n "$PORT_PIDS" ]; then
	echo "Cleaning backend pids on port $PORT: $PORT_PIDS"
	echo "$PORT_PIDS" | xargs -r kill -9 2>/dev/null || true
	stopped="1"
fi

rm -f "$PID_FILE"

if [ "$stopped" = "1" ]; then
	echo "Backend stopped."
else
	echo "Backend was not running."
fi