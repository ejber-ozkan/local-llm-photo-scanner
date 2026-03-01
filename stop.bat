@echo off
echo Stopping Local LLM Photo Scanner services...

echo [*] Stopping Backend on port 8000...
FOR /F "tokens=5" %%a IN ('netstat -aon ^| findstr "LISTENING" ^| findstr ":8000"') DO (
    taskkill /F /PID %%a >nul 2>&1
    echo [OK] Backend (PID %%a) terminated.
)

echo [*] Stopping Frontend on port 5173...
FOR /F "tokens=5" %%a IN ('netstat -aon ^| findstr "LISTENING" ^| findstr ":5173"') DO (
    taskkill /F /PID %%a >nul 2>&1
    echo [OK] Frontend (PID %%a) terminated.
)

echo.
echo All services have been stopped.
pause
