#!/bin/bash

# Script to test if services are running

echo "Testing services..."

for service in "SearxNG:8088" "Article extractor:3002"; do
    name="${service%%:*}"
    port="${service##*:}"
    if nc -z localhost "$port"; then
        echo "$name is running on port $port."
    else
        echo "$name is not running on port $port."
    fi
done

if curl -fsS http://127.0.0.1:8010/health >/dev/null 2>&1; then
    echo "News crawler is running on port 8010."
else
    echo "News crawler is not running on port 8010."
fi

# Test backend (assuming port 8000)
if nc -z localhost 8000; then
    echo "Backend service is running on port 8000."
else
    echo "Backend service is not running on port 8000."
fi

# Test frontend (assuming port 5173 for Vite)
if nc -z localhost 5173; then
    echo "Frontend service is running on port 5173."
else
    echo "Frontend service is not running on port 5173."
fi

echo "Service test completed."