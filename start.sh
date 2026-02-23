#!/bin/bash
VERSION="1.3.0"

echo "===================================================="
echo "   Local LLM Photo Scanner v$VERSION"
echo "===================================================="

# 1. Check if backend venv exists
if [ ! -d "backend/venv" ]; then
    echo "[!] First time setup detected: Backend virtual environment missing."
    echo "[*] Creating virtual environment..."
    python3 -m venv backend/venv
    echo "[*] Installing backend dependencies..."
    . backend/venv/bin/activate
    pip install -r backend/requirements.txt
fi

# 2. Check if frontend node_modules exists
if [ ! -d "frontend/node_modules" ]; then
    echo "[!] First time setup detected: Frontend dependencies missing."
    echo "[*] Running npm install..."
    (cd frontend && npm install)
fi

# 3. Clean up ports
echo "[*] Stopping any existing services on ports 8000 and 5173..."
lsof -t -i:8000 | xargs -r kill -9 2>/dev/null
lsof -t -i:5173 | xargs -r kill -9 2>/dev/null

# 4. Get Local IP Address
if [ "$(uname)" = "Darwin" ]; then
    LOCAL_IP=$(ipconfig getifaddr en0)
else
    LOCAL_IP=$(hostname -I | awk '{print $1}')
fi

echo ""
echo "===================================================="
echo "   Application is starting..."
echo ""
echo "   Local:   http://localhost:5173"
echo "   Network: http://$LOCAL_IP:5173"
echo ""
echo "   Connect from your iPad/Tablet/Other PC using:"
echo "   http://$LOCAL_IP:5173"
echo "===================================================="
echo ""

# Function to handle cleanup on exit
cleanup() {
    echo "Stopping services..."
    kill $BACKEND_PID 2>/dev/null
    exit
}

# Trap SIGINT and SIGTERM signals
trap cleanup INT TERM

# 5. Start services
echo "[*] Starting Backend..."
(cd backend && . venv/bin/activate && uvicorn photo_backend:app --host 0.0.0.0 --port 8000) &
BACKEND_PID=$!

echo "[*] Starting Frontend..."
cd frontend && npm run dev -- --host
