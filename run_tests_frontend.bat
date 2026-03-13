@echo off
setlocal enabledelayedexpansion
set "ROOT_DIR=%~dp0"
set /p VERSION=<"%ROOT_DIR%VERSION"

echo ====================================================
echo    Frontend Test Runner  v%VERSION%
echo ====================================================
echo.

:: 1. Check if frontend node_modules exists
if not exist "%ROOT_DIR%frontend\node_modules" (
    echo [!] Frontend dependencies not found.
    echo [*] Running npm install...
    cd /d "%ROOT_DIR%frontend"
    call npm install
    cd /d "%ROOT_DIR%"
)

echo [*] Running frontend tests...
echo.

cd /d "%ROOT_DIR%frontend"
call npx vitest run --reporter=verbose %*

echo.
echo ====================================================
echo    Frontend tests complete.
echo ====================================================
