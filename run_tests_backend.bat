@echo off
setlocal enabledelayedexpansion
set VERSION=1.6.0

echo ====================================================
echo    Backend Test Runner  v%VERSION%
echo ====================================================
echo.

:: 1. Check if backend venv exists
if not exist "backend\venv" (
    echo [!] Backend virtual environment not found.
    echo [*] Creating virtual environment...
    python -m venv backend\venv
    echo [*] Installing backend dependencies...
    call backend\venv\Scripts\activate.bat
    pip install -r backend\requirements.txt
)

echo [*] Running backend tests with coverage...
echo.

cd backend
call venv\Scripts\activate.bat
pytest -v --cov=. --cov-report=term-missing %*

echo.
echo ====================================================
echo    Backend tests complete.
echo ====================================================
