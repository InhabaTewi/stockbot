#!/bin/bash

# Script to start the backend service

echo "Starting backend service..."

cd /proj/stock_project

# Start the backend in the background
conda run -n testenv uvicorn server.main:app --reload --host 0.0.0.0 --port 8000 &

echo "Backend service started."