@echo off
setlocal enabledelayedexpansion
set VERSION=1.2.0

echo ====================================================
echo    Local LLM Photo Scanner v%VERSION%
echo ====================================================

:: 1. Check if backend venv exists
if not exist "backend\venv" (
    echo [!] First time setup detected: Backend virtual environment missing.
    echo [*] Creating virtual environment...
    python -m venv backend\venv
    echo [*] Installing backend dependencies...
    call backend\venv\Scripts\activate.bat
    pip install -r backend\requirements.txt
)

:: 2. Check if frontend node_modules exists
if not exist "frontend\node_modules" (
    echo [!] First time setup detected: Frontend dependencies missing.
    echo [*] Running npm install...
    cd frontend
    call npm install
    cd ..
)

:: 3. Clean up ports
echo [*] Stopping any existing services on ports 8000 and 5173...
FOR /F "tokens=5" %%a IN ('netstat -aon ^| findstr "LISTENING" ^| findstr ":8000"') DO taskkill /F /PID %%a >nul 2>&1
FOR /F "tokens=5" %%a IN ('netstat -aon ^| findstr "LISTENING" ^| findstr ":5173"') DO taskkill /F /PID %%a >nul 2>&1

:: 4. Get Local IP Address
set LOCAL_IP=127.0.0.1
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4 Address"') do (
    set temp_ip=%%a
    set LOCAL_IP=!temp_ip:~1!
)

echo.
echo ====================================================
echo    Application is starting... 
echo.
echo    Local:   http://localhost:5173
echo    Network: http://%LOCAL_IP%:5173
echo.
echo    Connect from your iPad/Tablet/Other PC using:
echo    http://%LOCAL_IP%:5173
echo ====================================================
echo.

:: 5. Start services
echo [*] Starting Backend...
start cmd /k "cd backend && call venv\Scripts\activate.bat && uvicorn photo_backend:app --host 0.0.0.0 --port 8000"

echo [*] Starting Frontend...
start cmd /k "cd frontend && npm run dev -- --host"

echo Done. Keep this window open or check the secondary windows for logs.
