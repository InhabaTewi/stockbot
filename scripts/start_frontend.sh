#!/bin/bash

# Script to start the frontend service

echo "Starting frontend service..."

cd /proj/stock_project/web

# Start the frontend in the background
npm run dev &

echo "Frontend service started."