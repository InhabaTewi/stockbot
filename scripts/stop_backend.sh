#!/bin/bash

# Script to stop the backend service

echo "Stopping backend service..."

# Kill the backend process (assuming it's running with uvicorn)
pkill -f "uvicorn"

echo "Backend service stopped."