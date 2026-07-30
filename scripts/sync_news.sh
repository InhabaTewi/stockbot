#!/bin/bash

set -euo pipefail

CRAWLER_URL="${NEWS_CRAWLER_URL:-http://127.0.0.1:8010}"

curl --fail-with-body --silent --show-error \
	-X POST "$CRAWLER_URL/v1/crawl" \
	-H "Content-Type: application/json" \
	-d '{"symbols":["1810.HK","2513.HK"],"max_results":5}'
printf '\n'

curl --fail-with-body --silent --show-error \
	-X POST "http://127.0.0.1:8000/api/news/sync"
printf '\n'