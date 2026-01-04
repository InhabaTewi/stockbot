#!/bin/bash

# Script to stop the frontend service

echo "Stopping frontend service..."

# Kill the frontend process (assuming it's running with vite)
pkill -f "vite"

echo "Frontend service stopped."