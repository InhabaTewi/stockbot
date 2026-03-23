#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Stopping stock_project services..."
"$SCRIPT_DIR/stop_backend.sh"
"$SCRIPT_DIR/stop_frontend.sh"
echo "All services stopped."