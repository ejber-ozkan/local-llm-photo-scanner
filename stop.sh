#!/bin/bash
echo "Stopping Local LLM Photo Scanner services..."

echo "[*] Stopping Backend on port 8000..."
lsof -t -i:8000 | xargs -r kill -9 2>/dev/null && echo "[OK] Backend terminated." || echo "[!] Backend not running or already stopped."

echo "[*] Stopping Frontend on port 5173..."
lsof -t -i:5173 | xargs -r kill -9 2>/dev/null && echo "[OK] Frontend terminated." || echo "[!] Frontend not running or already stopped."

echo ""
echo "All services have been stopped."
