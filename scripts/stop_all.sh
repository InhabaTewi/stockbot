#!/bin/bash

# Script to stop all services (frontend and backend)

echo "Stopping all services..."

# Kill backend
pkill -f "uvicorn"

# Kill frontend
pkill -f "vite"

echo "All services stopped."