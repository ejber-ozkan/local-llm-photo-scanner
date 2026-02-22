#!/bin/bash
echo "Starting Local LLM Photo Scanner..."

echo "Stopping any existing services on ports 8000 and 5173..."
lsof -t -i:8000 | xargs -r kill -9 2>/dev/null
lsof -t -i:5173 | xargs -r kill -9 2>/dev/null

# Function to handle cleanup on exit
cleanup() {
    echo "Stopping services..."
    kill $BACKEND_PID 2>/dev/null
    exit
}

# Trap SIGINT and SIGTERM signals
trap cleanup INT TERM

echo "Starting Backend..."
(cd backend && source venv/bin/activate && uvicorn photo_backend:app --host 0.0.0.0 --port 8000) &
BACKEND_PID=$!

echo "Starting Frontend..."
cd frontend && npm run dev
