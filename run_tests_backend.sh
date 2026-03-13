#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSION="$(tr -d '\r\n' < "$SCRIPT_DIR/VERSION")"

echo "===================================================="
echo "   Backend Test Runner  v$VERSION"
echo "===================================================="
echo ""

# 1. Check if backend venv exists
if [ ! -d "$SCRIPT_DIR/backend/venv" ]; then
    echo "[!] Backend virtual environment not found."
    echo "[*] Creating virtual environment..."
    python3 -m venv "$SCRIPT_DIR/backend/venv"
    echo "[*] Installing backend dependencies..."
    . "$SCRIPT_DIR/backend/venv/bin/activate"
    pip install -r "$SCRIPT_DIR/backend/requirements.txt"
fi

echo "[*] Running backend tests with coverage..."
echo ""

cd "$SCRIPT_DIR/backend"
. venv/bin/activate
pytest -v --cov=. --cov-report=term-missing "$@"

echo ""
echo "===================================================="
echo "   Backend tests complete."
echo "===================================================="
