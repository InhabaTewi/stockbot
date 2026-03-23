#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Starting stock_project services..."
"$SCRIPT_DIR/start_backend.sh"
"$SCRIPT_DIR/start_frontend.sh"
echo "All services started."