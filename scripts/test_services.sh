#!/bin/bash

# Script to test if services are running

echo "Testing services..."

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