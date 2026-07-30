#!/bin/bash

set -euo pipefail

PROJECT_DIR="/proj/stock_project"

if ! command -v podman >/dev/null 2>&1 || ! command -v podman-compose >/dev/null 2>&1; then
	echo "Error: Podman and podman-compose are required."
	echo "On CentOS 8 run: yum install -y podman podman-compose"
	exit 1
fi

"$PROJECT_DIR/scripts/start_news_infra.sh"