@echo off
setlocal enabledelayedexpansion
set VERSION=1.4.0

echo ====================================================
echo    Frontend Test Runner  v%VERSION%
echo ====================================================
echo.

:: 1. Check if frontend node_modules exists
if not exist "frontend\node_modules" (
    echo [!] Frontend dependencies not found.
    echo [*] Running npm install...
    cd frontend
    call npm install
    cd ..
)

echo [*] Running frontend tests...
echo.

cd frontend
call npx vitest run --reporter=verbose %*

echo.
echo ====================================================
echo    Frontend tests complete.
echo ====================================================
