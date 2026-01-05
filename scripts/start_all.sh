#!/bin/bash

# Script to start all services (frontend and backend)

echo "Starting all services..."

# Start backend
cd /proj/stock_project
conda run -n testenv uvicorn server.main:app --reload --host 0.0.0.0 --port 8000 &

# Start frontend
cd /proj/stock_project/web
npm run dev &

echo "All services started."