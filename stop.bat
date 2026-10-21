@echo off
rem Stop video-server: kill whatever listens on the port from .env.
setlocal
cd /d %~dp0

set "PORT=24433"
for /f "usebackq tokens=1,2 delims==" %%a in (`findstr /b /i "PORT=" .env 2^>nul`) do set "PORT=%%b"

set "KILLED="
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":%PORT%" ^| findstr "LISTENING"') do (
  echo [video-server] stopping pid %%p
  taskkill /f /pid %%p >nul 2>&1
  set "KILLED=1"
)

if defined KILLED (
  echo [video-server] stopped
) else (
  echo [video-server] nothing listening on port %PORT%
)

rem end the scheduled task wrapper too, if it was started that way
schtasks /End /TN video-server >nul 2>&1
exit /b 0
