@echo off
rem Start video-server in a detached window. Port is read from .env.
setlocal
cd /d %~dp0

set "PORT=24433"
for /f "usebackq tokens=1,2 delims==" %%a in (`findstr /b /i "PORT=" .env 2^>nul`) do set "PORT=%%b"

if not exist ".env" (
  echo [video-server] .env not found. Copy .env.example to .env and set MEDIA_ROOT first.
  exit /b 1
)

netstat -ano | findstr ":%PORT%" | findstr "LISTENING" >nul 2>&1
if not errorlevel 1 (
  echo [video-server] already listening on port %PORT%, nothing to do.
  exit /b 0
)

echo [video-server] starting on port %PORT% ...
start "video-server" /min cmd /c "node server.js 1>>server.log 2>&1"

rem ping instead of timeout: works without a console
ping -n 3 127.0.0.1 >nul 2>&1

netstat -ano | findstr ":%PORT%" | findstr "LISTENING" >nul 2>&1
if errorlevel 1 (
  echo [video-server] failed to start, check server.log
  exit /b 1
)
echo [video-server] up: http://localhost:%PORT%
exit /b 0
