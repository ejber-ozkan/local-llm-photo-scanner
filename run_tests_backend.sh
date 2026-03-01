#!/bin/bash
VERSION="1.7.0"

echo "===================================================="
echo "   Backend Test Runner  v$VERSION"
echo "===================================================="
echo ""

# 1. Check if backend venv exists
if [ ! -d "backend/venv" ]; then
    echo "[!] Backend virtual environment not found."
    echo "[*] Creating virtual environment..."
    python3 -m venv backend/venv
    echo "[*] Installing backend dependencies..."
    . backend/venv/bin/activate
    pip install -r backend/requirements.txt
fi

echo "[*] Running backend tests with coverage..."
echo ""

cd backend
. venv/bin/activate
pytest -v --cov=. --cov-report=term-missing "$@"

echo ""
echo "===================================================="
echo "   Backend tests complete."
echo "===================================================="
