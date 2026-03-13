@echo off
setlocal enabledelayedexpansion
set "ROOT_DIR=%~dp0"
set /p VERSION=<"%ROOT_DIR%VERSION"

echo ====================================================
echo    Backend Test Runner  v%VERSION%
echo ====================================================
echo.

:: 1. Check if backend venv exists
if not exist "%ROOT_DIR%backend\venv" (
    echo [!] Backend virtual environment not found.
    echo [*] Creating virtual environment...
    python -m venv "%ROOT_DIR%backend\venv"
    echo [*] Installing backend dependencies...
    call "%ROOT_DIR%backend\venv\Scripts\activate.bat"
    pip install -r "%ROOT_DIR%backend\requirements.txt"
)

echo [*] Running backend tests with coverage...
echo.

cd /d "%ROOT_DIR%backend"
call venv\Scripts\activate.bat
pytest -v --cov=. --cov-report=term-missing %*

echo.
echo ====================================================
echo    Backend tests complete.
echo ====================================================
