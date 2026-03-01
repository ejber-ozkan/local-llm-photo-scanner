#!/bin/bash
VERSION="1.7.0"

echo "===================================================="
echo "   Frontend Test Runner  v$VERSION"
echo "===================================================="
echo ""

# 1. Check if frontend node_modules exists
if [ ! -d "frontend/node_modules" ]; then
    echo "[!] Frontend dependencies not found."
    echo "[*] Running npm install..."
    (cd frontend && npm install)
fi

echo "[*] Running frontend tests..."
echo ""

cd frontend
npx vitest run --reporter=verbose "$@"

echo ""
echo "===================================================="
echo "   Frontend tests complete."
echo "===================================================="
