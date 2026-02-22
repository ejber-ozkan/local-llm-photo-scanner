@echo off
echo Starting Local LLM Photo Scanner...

echo Stopping any existing services on ports 8000 and 5173...
FOR /F "tokens=5" %%a IN ('netstat -aon ^| findstr "LISTENING" ^| findstr ":8000"') DO taskkill /F /PID %%a >nul 2>&1
FOR /F "tokens=5" %%a IN ('netstat -aon ^| findstr "LISTENING" ^| findstr ":5173"') DO taskkill /F /PID %%a >nul 2>&1

echo Starting Backend...
start cmd /k "cd backend && call venv\Scripts\activate.bat && uvicorn photo_backend:app --host 0.0.0.0 --port 8000"

echo Starting Frontend...
start cmd /k "cd frontend && npm run dev"

echo Both services have been started in separate windows.
