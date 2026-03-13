#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSION="$(tr -d '\r\n' < "$SCRIPT_DIR/VERSION")"

echo "===================================================="
echo "   Frontend Test Runner  v$VERSION"
echo "===================================================="
echo ""

# 1. Check if frontend node_modules exists
if [ ! -d "$SCRIPT_DIR/frontend/node_modules" ]; then
    echo "[!] Frontend dependencies not found."
    echo "[*] Running npm install..."
    (cd "$SCRIPT_DIR/frontend" && npm install)
fi

echo "[*] Running frontend tests..."
echo ""

cd "$SCRIPT_DIR/frontend"
npx vitest run --reporter=verbose "$@"

echo ""
echo "===================================================="
echo "   Frontend tests complete."
echo "===================================================="
